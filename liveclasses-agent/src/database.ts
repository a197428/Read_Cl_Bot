import { Broadcast, Notification } from './types';
import { buildTomorrowBroadcastUtcIso, getTomorrowMoscowRangeUtc } from './time';
import { ProcessedArticle, ArticleSeen } from './types';

type BroadcastInput = {
  title: string;
  start_time?: string;
  time?: string;
  author: string;
  url: string;
  category?: string;
};

// ============================================================================
// Legacy: Broadcasts
// ============================================================================

export async function clearOldBroadcasts(db: D1Database): Promise<void> {
  try {
    await db.prepare('DELETE FROM broadcasts').run();
    console.log('Cleared old broadcasts from database');
  } catch (error) {
    console.error('Failed to clear old broadcasts:', error);
    throw error;
  }
}

export async function saveBroadcasts(
  broadcasts: BroadcastInput[],
  db: D1Database
): Promise<void> {
  if (broadcasts.length === 0) {
    console.log('No broadcasts to save');
    return;
  }

  try {
    const insertStmt = db.prepare(`
      INSERT INTO broadcasts (title, start_time, start_datetime, author, url, category)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(title, start_datetime) DO NOTHING
    `);

    const batch = broadcasts.map(broadcast => {
      const normalizedTime = (broadcast.start_time || broadcast.time || '').trim();
      if (!normalizedTime) {
        throw new Error(`Broadcast "${broadcast.title}" has no start_time/time`);
      }

      const startDateTimeIso = buildTomorrowBroadcastUtcIso(normalizedTime);

      return insertStmt.bind(
        broadcast.title,
        normalizedTime,
        startDateTimeIso,
        broadcast.author,
        broadcast.url,
        broadcast.category || null
      );
    });

    const result = await db.batch(batch);
    console.log(`Saved ${result.reduce((sum, r) => sum + (r.meta.changes || 0), 0)} broadcasts to database`);
  } catch (error) {
    console.error('Failed to save broadcasts:', error);
    throw error;
  }
}

export async function getBroadcastsForTomorrow(db: D1Database): Promise<Broadcast[]> {
  try {
    const { startUtcIso, endUtcIso } = getTomorrowMoscowRangeUtc();

    const { results } = await db.prepare(`
      SELECT * FROM broadcasts 
      WHERE start_datetime >= ?
      AND start_datetime < ?
      ORDER BY start_datetime
    `).bind(startUtcIso, endUtcIso).all();

    return results as unknown as Broadcast[];
  } catch (error) {
    console.error('Failed to get broadcasts for tomorrow:', error);
    throw error;
  }
}

export async function getUpcomingBroadcasts(db: D1Database, minutesBefore: number = 15): Promise<Broadcast[]> {
  try {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutesBefore * 60000);

    const { results } = await db.prepare(`
      SELECT * FROM broadcasts 
      WHERE start_datetime BETWEEN ? AND ?
      AND id NOT IN (SELECT broadcast_id FROM notifications WHERE status = 'sent')
      ORDER BY start_datetime
    `).bind(
      now.toISOString(),
      targetTime.toISOString()
    ).all();

    return results as unknown as Broadcast[];
  } catch (error) {
    console.error('Failed to get upcoming broadcasts:', error);
    throw error;
  }
}

export async function getAllBroadcasts(db: D1Database): Promise<Broadcast[]> {
  try {
    const { results } = await db.prepare(`
      SELECT * FROM broadcasts 
      ORDER BY start_datetime
    `).all();

    return results as unknown as Broadcast[];
  } catch (error) {
    console.error('Failed to get all broadcasts:', error);
    throw error;
  }
}

export async function searchBroadcasts(db: D1Database, query: string): Promise<Broadcast[]> {
  try {
    const { results } = await db.prepare(`
      SELECT * FROM broadcasts 
      WHERE title LIKE ? OR author LIKE ? OR category LIKE ?
      ORDER BY start_datetime
    `).bind(`%${query}%`, `%${query}%`, `%${query}%`).all();

    return results as unknown as Broadcast[];
  } catch (error) {
    console.error('Failed to search broadcasts:', error);
    throw error;
  }
}

export async function getNextBroadcast(db: D1Database): Promise<Broadcast | null> {
  try {
    const now = new Date();

    const result = await db.prepare(`
      SELECT * FROM broadcasts 
      WHERE start_datetime > ?
      ORDER BY start_datetime
      LIMIT 1
    `).bind(now.toISOString()).first();

    return result as unknown as Broadcast | null;
  } catch (error) {
    console.error('Failed to get next broadcast:', error);
    throw error;
  }
}

export async function markNotificationSent(db: D1Database, broadcastId: number): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO notifications (broadcast_id, notified_at, status)
      VALUES (?, ?, ?)
    `).bind(
      broadcastId,
      new Date().toISOString(),
      'sent'
    ).run();
  } catch (error) {
    console.error('Failed to mark notification as sent:', error);
    throw error;
  }
}

export async function isNotificationSent(db: D1Database, broadcastId: number): Promise<boolean> {
  try {
    const result = await db.prepare(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE broadcast_id = ? AND status = 'sent'
    `).bind(broadcastId).first();

    return (result as any)?.count > 0;
  } catch (error) {
    console.error('Failed to check notification status:', error);
    return false;
  }
}

export async function upsertUser(
  db: D1Database,
  telegramId: string,
  username?: string
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO users (telegram_id, username)
      VALUES (?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username
    `).bind(telegramId, username || null).run();
  } catch (error) {
    console.error('Failed to upsert user:', error);
    throw error;
  }
}

export async function getUserTelegramIds(db: D1Database): Promise<string[]> {
  try {
    const { results } = await db.prepare(`
      SELECT telegram_id FROM users
    `).all();

    return (results as Array<{ telegram_id: string }>).map(row => row.telegram_id);
  } catch (error) {
    console.error('Failed to get user telegram ids:', error);
    throw error;
  }
}

export async function getDatabaseStats(db: D1Database): Promise<{
  totalBroadcasts: number;
  totalNotifications: number;
  upcomingBroadcasts: number;
}> {
  try {
    const { startUtcIso, endUtcIso } = getTomorrowMoscowRangeUtc();

    const [broadcastsResult, notificationsResult, upcomingResult] = await db.batch([
      db.prepare('SELECT COUNT(*) as count FROM broadcasts'),
      db.prepare('SELECT COUNT(*) as count FROM notifications'),
      db.prepare(`
        SELECT COUNT(*) as count FROM broadcasts 
        WHERE start_datetime >= ?
        AND start_datetime < ?
      `).bind(startUtcIso, endUtcIso)
    ]);

    return {
      totalBroadcasts: (broadcastsResult.results[0] as any)?.count || 0,
      totalNotifications: (notificationsResult.results[0] as any)?.count || 0,
      upcomingBroadcasts: (upcomingResult.results[0] as any)?.count || 0
    };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    throw error;
  }
}

// ============================================================================
// NEW: Articles (AI Agent layer)
// ============================================================================

/**
 * Сохраняет обработанную статью
 */
export async function saveProcessedArticle(
  db: D1Database,
  article: ProcessedArticle
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO articles_processed
        (seen_id, title, summary, practical_value, key_ideas, simple_explanation,
         conclusion, tags, score, source_score, relevance_score, depth_score, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      article.seen_id,
      article.title,
      article.summary,
      article.practical_value || null,
      JSON.stringify(article.key_ideas),
      article.simple_explanation || null,
      article.conclusion || null,
      JSON.stringify(article.tags),
      article.score,
      article.source_score,
      article.relevance_score,
      article.depth_score,
      article.url
    ).run();

    console.log(`Saved processed article: ${article.title} (score: ${article.score})`);
  } catch (error) {
    console.error('Failed to save processed article:', error);
    throw error;
  }
}

/**
 * Получает обработанные статьи за последние N дней
 */
export async function getRecentArticles(
  db: D1Database,
  days: number = 7
): Promise<ProcessedArticle[]> {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { results } = await db.prepare(`
      SELECT * FROM articles_processed
      WHERE processed_at >= ?
      ORDER BY score DESC, processed_at DESC
    `).bind(cutoff).all();

    return (results as any[]).map(row => parseArticleRow(row));
  } catch (error) {
    console.error('Failed to get recent articles:', error);
    return [];
  }
}

/**
 * Ищет статьи по тегу (LIKE поиск)
 */
export async function searchArticlesByTag(
  db: D1Database,
  tag: string,
  days: number = 7
): Promise<ProcessedArticle[]> {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { results } = await db.prepare(`
      SELECT * FROM articles_processed
      WHERE tags LIKE ?
        AND processed_at >= ?
      ORDER BY score DESC
      LIMIT 10
    `).bind(`%${tag}%`, cutoff).all();

    return (results as any[]).map(row => parseArticleRow(row));
  } catch (error) {
    console.error('Failed to search articles by tag:', error);
    return [];
  }
}

/**
 * Получает топ-N статей за период
 */
export async function getTopArticles(
  db: D1Database,
  count: number = 5,
  days: number = 1
): Promise<ProcessedArticle[]> {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { results } = await db.prepare(`
      SELECT * FROM articles_processed
      WHERE processed_at >= ?
      ORDER BY score DESC
      LIMIT ?
    `).bind(cutoff, count).all();

    return (results as any[]).map(row => parseArticleRow(row));
  } catch (error) {
    console.error('Failed to get top articles:', error);
    return [];
  }
}

/**
 * Проверяет, есть ли статьи за сегодня
 */
export async function hasArticlesToday(db: D1Database): Promise<boolean> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db.prepare(`
      SELECT COUNT(*) as count FROM articles_processed
      WHERE processed_at >= ?
    `).bind(today.toISOString()).first();

    return ((result as any)?.count || 0) > 0;
  } catch (error) {
    console.error('Failed to check articles today:', error);
    return false;
  }
}

/**
 * Парсит строку БД в ProcessedArticle
 */
function parseArticleRow(row: any): ProcessedArticle {
  return {
    id: row.id,
    seen_id: row.seen_id,
    title: row.title,
    summary: row.summary,
    practical_value: row.practical_value,
    key_ideas: safeParseJson(row.key_ideas, []),
    simple_explanation: row.simple_explanation,
    conclusion: row.conclusion,
    tags: safeParseJson(row.tags, []),
    score: row.score,
    source_score: row.source_score,
    relevance_score: row.relevance_score,
    depth_score: row.depth_score,
    processed_at: row.processed_at,
    url: row.url,
  };
}

/**
 * Безопасный JSON.parse
 */
function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
