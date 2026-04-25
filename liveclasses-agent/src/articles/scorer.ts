/**
 * Скоринг статей
 * Базовый скоринг по источнику + LLM-оценка
 */

import { RssItem, ProcessedArticle, ArticleSource } from '../types';

/**
 * Базовые скоры по источникам
 */
const SOURCE_BASE_SCORES: Record<ArticleSource, number> = {
  thenewstack: 3,
  infoworld: 3,
  tds: 2,
};

/**
 * Вычисляет базовый скор по источнику
 */
export function getBaseScore(source: ArticleSource): number {
  return SOURCE_BASE_SCORES[source] || 0;
}

/**
 * Вычисляет итоговый скор статьи
 */
export function calculateTotalScore(
  source: ArticleSource,
  relevanceScore: number,
  depthScore: number
): number {
  const base = getBaseScore(source);
  const rel = Math.min(Math.max(relevanceScore, 0), 2);
  const depth = Math.min(Math.max(depthScore, 0), 1);
  return base + rel + depth;
}

/**
 * Сортирует статьи по скору (убывание)
 */
export function sortByScore(articles: ProcessedArticle[]): ProcessedArticle[] {
  return [...articles].sort((a, b) => b.score - a.score);
}

/**
 * Выбирает топ-N статей
 */
export function pickTopArticles(
  articles: ProcessedArticle[],
  count: number = 5
): ProcessedArticle[] {
  return sortByScore(articles).slice(0, count);
}

/**
 * Проверяет, проходит ли статья минимальный порог скора
 */
export function passesScoreThreshold(
  article: ProcessedArticle,
  threshold: number = 4
): boolean {
  return article.score >= threshold;
}
