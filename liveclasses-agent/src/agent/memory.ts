/**
 * Agent Memory Layer
 * Память агента: история запросов и накопленные данные
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
 * Получает популярные темы из истории запросов
 */
export async function getPopularTopics(
  db: D1Database,
  limit: number = 5
): Promise<string[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT extracted_topic, COUNT(*) as count
         FROM user_queries
         WHERE extracted_topic IS NOT NULL
           AND extracted_topic != ''
         GROUP BY extracted_topic
         ORDER BY count DESC
         LIMIT ?`
      )
      .bind(limit)
      .all();

    return (results as Array<{ extracted_topic: string }>).map(r => r.extracted_topic);
  } catch (error) {
    console.error('Failed to get popular topics:', error);
    return [];
  }
}

/**
 * Проверяет, спрашивал ли пользователь эту тему недавно
 */
export async function hasRecentlyAsked(
  db: D1Database,
  telegramId: string,
  topic: string,
  hoursBack: number = 24
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    const result = await db
      .prepare(
        `SELECT COUNT(*) as count FROM user_queries
         WHERE telegram_id = ?
           AND extracted_topic LIKE ?
           AND created_at >= ?`
      )
      .bind(telegramId, `%${topic}%`, cutoff)
      .first();

    return ((result as any)?.count || 0) > 0;
  } catch (error) {
    console.error('Failed to check recent queries:', error);
    return false;
  }
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
    lines.push(`   💡 ${a.practical_value || ''}`);
    lines.push(`   🔗 ${a.url}`);
  }

  return lines.join('\n');
}

/**
 * Формирует контекст для принятия решений агентом
 * Использует память для персонализации
 */
export async function buildAgentContext(
  db: D1Database,
  telegramId: string | undefined,
  currentTopic: string
): Promise<{
  popularTopics: string[];
  recentQueries: UserQuery[];
  context: string;
}> {
  const popularTopics = await getPopularTopics(db, 5);
  const recentQueries = await getRecentQueriesByTopic(db, currentTopic, 3);

  let context = '';
  if (recentQueries.length > 0) {
    context += `Недавние запросы по теме "${currentTopic}": `;
    context += recentQueries.map(q => q.query).join(', ');
    context += '\n';
  }

  if (popularTopics.length > 0) {
    context += `Популярные темы: ${popularTopics.join(', ')}`;
  }

  return { popularTopics, recentQueries, context };
}
