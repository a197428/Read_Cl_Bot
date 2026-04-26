import { ProcessedArticle } from './types';

// ============================================================================
// Users (for digest delivery)
// ============================================================================

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

// ============================================================================
// Articles (AI Agent layer)
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
