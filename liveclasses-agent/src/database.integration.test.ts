import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOldBroadcasts,
  getBroadcastsForTomorrow,
  getUpcomingBroadcasts,
  markNotificationSent,
  saveBroadcasts,
} from './database';

type BroadcastRow = {
  id: number;
  title: string;
  start_time: string;
  start_datetime: string;
  author: string;
  url: string;
  category: string | null;
};

type NotificationRow = {
  id: number;
  broadcast_id: number;
  notified_at: string;
  status: 'sent' | 'failed' | 'pending';
};

class FakePrepared {
  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
    private readonly params: unknown[] = []
  ) {}

  bind(...params: unknown[]): FakePrepared {
    return new FakePrepared(this.db, this.sql, params);
  }

  async run(): Promise<any> {
    return this.db.executeRun(this.sql, this.params);
  }

  async all(): Promise<any> {
    return this.db.executeAll(this.sql, this.params);
  }

  async first(): Promise<any> {
    return this.db.executeFirst(this.sql, this.params);
  }
}

class FakeD1 {
  private broadcastSeq = 1;
  private notificationSeq = 1;
  private broadcasts: BroadcastRow[] = [];
  private notifications: NotificationRow[] = [];

  prepare(query: string): any {
    return new FakePrepared(this, query);
  }

  async batch(statements: any[]): Promise<any[]> {
    const results: any[] = [];
    for (const statement of statements as FakePrepared[]) {
      const sql = this.normalizeSql((statement as any).sql ?? '');
      if (sql.includes('SELECT COUNT(*) as count')) {
        results.push(await statement.all());
      } else {
        results.push(await statement.run());
      }
    }
    return results;
  }

  private normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
  }

  async executeRun(sqlRaw: string, params: unknown[]): Promise<any> {
    const sql = this.normalizeSql(sqlRaw);

    if (sql.startsWith('DELETE FROM broadcasts')) {
      const changes = this.broadcasts.length;
      this.broadcasts = [];
      return { meta: { changes } };
    }

    if (sql.includes('INSERT INTO broadcasts')) {
      const [title, start_time, start_datetime, author, url, category] = params as [
        string,
        string,
        string,
        string,
        string,
        string | null,
      ];

      const exists = this.broadcasts.some(
        b => b.title === title && b.start_datetime === start_datetime
      );
      if (exists) {
        return { meta: { changes: 0 } };
      }

      this.broadcasts.push({
        id: this.broadcastSeq++,
        title,
        start_time,
        start_datetime,
        author,
        url,
        category,
      });
      return { meta: { changes: 1 } };
    }

    if (sql.includes('INSERT INTO notifications')) {
      const [broadcast_id, notified_at, status] = params as [
        number,
        string,
        'sent' | 'failed' | 'pending',
      ];
      this.notifications.push({
        id: this.notificationSeq++,
        broadcast_id,
        notified_at,
        status,
      });
      return { meta: { changes: 1 } };
    }

    throw new Error(`Unsupported run SQL in fake DB: ${sql}`);
  }

  async executeAll(sqlRaw: string, params: unknown[]): Promise<any> {
    const sql = this.normalizeSql(sqlRaw);

    if (sql.includes('SELECT * FROM broadcasts WHERE start_datetime >= ? AND start_datetime < ?')) {
      const [startIso, endIso] = params as [string, string];
      const results = this.broadcasts
        .filter(b => b.start_datetime >= startIso && b.start_datetime < endIso)
        .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
      return { results };
    }

    if (
      sql.includes('SELECT * FROM broadcasts WHERE start_datetime BETWEEN ? AND ?') &&
      sql.includes("id NOT IN (SELECT broadcast_id FROM notifications WHERE status = 'sent')")
    ) {
      const [startIso, endIso] = params as [string, string];
      const sentIds = new Set(
        this.notifications.filter(n => n.status === 'sent').map(n => n.broadcast_id)
      );
      const results = this.broadcasts
        .filter(
          b =>
            b.start_datetime >= startIso &&
            b.start_datetime <= endIso &&
            !sentIds.has(b.id)
        )
        .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
      return { results };
    }

    if (sql === 'SELECT COUNT(*) as count FROM broadcasts') {
      return { results: [{ count: this.broadcasts.length }] };
    }

    if (sql === 'SELECT COUNT(*) as count FROM notifications') {
      return { results: [{ count: this.notifications.length }] };
    }

    throw new Error(`Unsupported all SQL in fake DB: ${sql}`);
  }

  async executeFirst(sqlRaw: string, params: unknown[]): Promise<any> {
    const sql = this.normalizeSql(sqlRaw);

    if (
      sql.includes('SELECT * FROM broadcasts') &&
      sql.includes('WHERE start_datetime > ?') &&
      sql.includes('LIMIT 1')
    ) {
      const [nowIso] = params as [string];
      const result = this.broadcasts
        .filter(b => b.start_datetime > nowIso)
        .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))[0];
      return result ?? null;
    }

    throw new Error(`Unsupported first SQL in fake DB: ${sql}`);
  }

  dumpBroadcasts(): BroadcastRow[] {
    return [...this.broadcasts];
  }
}

describe('database integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves tomorrow broadcasts in Moscow timezone and filters notification window', async () => {
    const dbRaw = new FakeD1();
    const db = dbRaw as unknown as D1Database;

    // 2026-04-23 13:00:00 Moscow (UTC+3)
    vi.setSystemTime(new Date('2026-04-23T10:00:00.000Z'));
    await clearOldBroadcasts(db);
    await saveBroadcasts(
      [
        {
          title: 'Ночная трансляция',
          start_time: '00:30',
          author: 'Автор 1',
          url: 'https://liveclasses.ru/course/photo/night/',
        },
        {
          title: 'Дневная трансляция',
          start_time: '15:00',
          author: 'Автор 2',
          url: 'https://liveclasses.ru/course/art/day/',
        },
      ],
      db
    );

    const stored = dbRaw.dumpBroadcasts();
    expect(stored).toHaveLength(2);
    expect(stored[0].start_datetime).toBe('2026-04-23T21:30:00.000Z');
    expect(stored[1].start_datetime).toBe('2026-04-24T12:00:00.000Z');

    const tomorrow = await getBroadcastsForTomorrow(db);
    expect(tomorrow).toHaveLength(2);

    // За 15 минут до 00:30 МСК (то есть 21:15 UTC предыдущего дня)
    vi.setSystemTime(new Date('2026-04-23T21:15:00.000Z'));
    const upcoming = await getUpcomingBroadcasts(db, 15);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].title).toBe('Ночная трансляция');

    await markNotificationSent(db, upcoming[0].id!);
    const upcomingAfterNotification = await getUpcomingBroadcasts(db, 15);
    expect(upcomingAfterNotification).toHaveLength(0);
  });
});
