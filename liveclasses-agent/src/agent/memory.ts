/**
 * Agent Memory Layer
 * Доступ к истории запросов и накопленным данным
 */

import { UserQuery, ProcessedArticle } from '../types';

/**
 * Сохраняет запрос пользователя в память
 */
export async function saveUserQuery(
  db: D1Database,
  query: string,
  extractedTopic: string | undefined,
  responseType: 'broadcasts' | 'articles' | 'general',
  telegramId?: string
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO user_queries (telegram_id, query, extracted_topic, response_type)
         VALUES (?, ?, ?, ?)`
      )
      .bind(telegramId || null, query, extractedTopic || null, responseType)
      .run();
  } catch (error) {
    console.error('Failed to save user query:', error);
  }
}

/**
 * Получает последние запросы по теме
 */
export async function getRecentQueriesByTopic(
  db: D1Database,
  topic: string,
  limit: number = 5
): Promise<UserQuery[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM user_queries
       WHERE extracted_topic LIKE ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(`%${topic}%`, limit)
    .all();

  return results as unknown as UserQuery[];
}

/**
 * Формирует контекст из накопленных статей для LLM
 */
export function buildArticlesContext(articles: ProcessedArticle[]): string {
  if (articles.length === 0) {
    return 'Нет данных о статьях по запрошенной теме.';
  }

  const lines: string[] = ['Найденные статьи:'];

  for (const a of articles) {
    lines.push(`\n📄 ${a.title}`);
    lines.push(`   🏷️ ${a.tags.join(', ')}`);
    lines.push(`   📝 ${a.summary}`);
    lines.push(`   🔗 ${a.url}`);
  }

  return lines.join('\n');
}
