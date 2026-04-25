/**
 * Дедупликация статей
 * Проверка по SHA256(url) в articles_seen
 */

import { RssItem, ArticleSeen } from '../types';

/**
 * Вычисляет SHA256 хеш строки
 */
export async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Фильтрует только новые статьи (которых нет в articles_seen)
 */
export async function filterNewArticles(
  items: RssItem[],
  db: D1Database
): Promise<RssItem[]> {
  if (items.length === 0) return [];

  // Вычисляем хеши для всех URL
  const hashedItems = await Promise.all(
    items.map(async item => ({
      item,
      hash: await hashUrl(item.link),
    }))
  );

  // Проверяем наличие в БД (batch запрос)
  const newItems: RssItem[] = [];

  for (const { item, hash } of hashedItems) {
    const existing = await db
      .prepare('SELECT id FROM articles_seen WHERE url_hash = ?')
      .bind(hash)
      .first();

    if (!existing) {
      newItems.push(item);
    }
  }

  return newItems;
}

/**
 * Сохраняет статью в articles_seen (после проверки дедупликации)
 */
export async function markArticleAsSeen(
  item: RssItem,
  db: D1Database
): Promise<number> {
  const urlHash = await hashUrl(item.link);

  const result = await db
    .prepare(
      `INSERT INTO articles_seen (url, url_hash, source) VALUES (?, ?, ?)`
    )
    .bind(item.link, urlHash, item.source)
    .run();

  return result.meta.last_row_id as number;
}

/**
 * Проверяет, была ли статья уже обработана
 */
export async function isArticleProcessed(url: string, db: D1Database): Promise<boolean> {
  const urlHash = await hashUrl(url);
  const row = await db
    .prepare('SELECT id FROM articles_seen WHERE url_hash = ?')
    .bind(urlHash)
    .first();
  return !!row;
}
