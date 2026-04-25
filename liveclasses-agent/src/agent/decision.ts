/**
 * Agent Decision Layer
 * Определяет стратегию ответа на основе контекста
 */

import { ExtractedTopic, AgentResponseType, Environment } from '../types';
import { understandQuery } from './understanding';

/**
 * Результат принятия решения
 */
export interface Decision {
  responseType: AgentResponseType;
  topic: string;
  keywords: string[];
  shouldUseFallback: boolean;
  confidence: number; // 0..1
}

/**
 * Принимает решение о типе ответа
 */
export async function decideResponse(
  query: string,
  env: Environment
): Promise<Decision> {
  const understood = understandQuery(query);

  // Оценка уверенности
  let confidence = 0.5;
  if (understood.keywords.length > 0) confidence += 0.3;
  if (understood.responseType !== 'general') confidence += 0.2;

  return {
    responseType: understood.responseType,
    topic: understood.topic,
    keywords: understood.keywords,
    shouldUseFallback: confidence < 0.5,
    confidence: Math.min(confidence, 1),
  };
}

/**
 * Определяет, нужно ли искать в статьях
 */
export function shouldSearchArticles(decision: Decision): boolean {
  return decision.responseType === 'articles';
}

/**
 * Определяет, нужно ли искать в трансляциях
 */
export function shouldSearchBroadcasts(decision: Decision): boolean {
  return decision.responseType === 'broadcasts';
}
