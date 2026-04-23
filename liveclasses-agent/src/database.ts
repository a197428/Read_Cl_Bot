import { Broadcast, Notification } from './types';
import { buildTomorrowBroadcastUtcIso, getTomorrowMoscowRangeUtc } from './time';

type BroadcastInput = {
  title: string;
  start_time?: string;
  time?: string;
  author: string;
  url: string;
  category?: string;
};

/**
 * Очищает старые трансляции из базы данных
 */
export async function clearOldBroadcasts(db: D1Database): Promise<void> {
  try {
    // Удаляем все трансляции (так как храним только на завтра)
    await db.prepare('DELETE FROM broadcasts').run();
    console.log('Cleared old broadcasts from database');
  } catch (error) {
    console.error('Failed to clear old broadcasts:', error);
    throw error;
  }
}

/**
 * Сохраняет трансляции в базу данных
 */
export async function saveBroadcasts(
  broadcasts: BroadcastInput[],
  db: D1Database
): Promise<void> {
  if (broadcasts.length === 0) {
    console.log('No broadcasts to save');
    return;
  }

  try {
    // Используем транзакцию для эффективной вставки
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

      // Сохраняем в UTC ISO, но как "завтра по Москве"
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

/**
 * Получает трансляции на завтра
 */
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

/**
 * Получает ближайшие трансляции (за указанное количество минут)
 */
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

/**
 * Получает все трансляции
 */
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

/**
 * Получает трансляции по ключевому слову
 */
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

/**
 * Получает ближайшую трансляцию
 */
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

/**
 * Помечает уведомление как отправленное
 */
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

/**
 * Проверяет, было ли отправлено уведомление для трансляции
 */
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

/**
 * Создает/обновляет пользователя бота
 */
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

/**
 * Получает список telegram_id всех пользователей
 */
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

/**
 * Получает статистику по базе данных
 */
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
