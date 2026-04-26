/**
 * Agent Decision Layer
 * Определяет стратегию ответа на основе контекста
 */

import { ExtractedTopic, Environment } from '../types';
import { understandQuery } from './understanding';

/**
 * Результат принятия решения
 */
export interface Decision {
  responseType: 'articles' | 'general';
  topic: string;
  keywords: string[];
  confidence: number;
}

/**
 * Принимает решение о типе ответа
 */
export async function decideResponse(
  query: string,
  env: Environment
): Promise<Decision> {
  const understood = understandQuery(query);

  let confidence = 0.5;
  if (understood.keywords.length > 0) confidence += 0.3;
  if (understood.responseType !== 'general') confidence += 0.2;

  return {
    responseType: understood.responseType as 'articles' | 'general',
    topic: understood.topic,
    keywords: understood.keywords,
    confidence: Math.min(confidence, 1),
  };
}

/**
 * Определяет, нужно ли искать в статьях
 */
export function shouldSearchArticles(decision: Decision): boolean {
  return decision.responseType === 'articles' || decision.topic.length > 0;
}
