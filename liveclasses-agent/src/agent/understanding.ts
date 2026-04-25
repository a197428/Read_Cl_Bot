/**
 * Agent Understanding Layer
 * Извлечение темы и намерения из пользовательского запроса
 */

import { ExtractedTopic, AgentResponseType } from '../types';

/**
 * Ключевые слова для определения типа запроса
 */
const ARTICLE_KEYWORDS = [
  'новост', 'стат', 'дайджест', 'news', 'article',
  'ai', 'agents', 'агент', 'llm', 'vibe coding', 'vibe-coding',
  'вайбкодинг', 'вайб', 'вайб-кодинг',
  'инфраструктур', 'infra', 'devops', 'cloud',
  'технолог', 'tech', 'разработк', 'development',
  'нейросет', 'нейронн', 'машинн обучен', 'deep learning',
  'openai', 'anthropic', 'gemini', 'claude', 'deepseek',
  'что нов', 'что есть', 'что пишут', 'что происходит',
];

const BROADCAST_KEYWORDS = [
  'трансляц', 'broadcast', 'live', 'эфир',
  'расписан', 'schedule', 'завтра', 'tomorrow',
  'мастер-класс', 'вебинар', 'лекци',
  'преподаватель', 'автор', 'начало',
];

/**
 * Извлекает тему и определяет тип ответа из запроса пользователя
 */
export function understandQuery(query: string): ExtractedTopic {
  const lower = query.toLowerCase().trim();

  // Определяем тип ответа
  let responseType: AgentResponseType = 'general';

  const hasArticleKeywords = ARTICLE_KEYWORDS.some(k => lower.includes(k));
  const hasBroadcastKeywords = BROADCAST_KEYWORDS.some(k => lower.includes(k));

  if (hasArticleKeywords && !hasBroadcastKeywords) {
    responseType = 'articles';
  } else if (hasBroadcastKeywords && !hasArticleKeywords) {
    responseType = 'broadcasts';
  } else if (hasArticleKeywords && hasBroadcastKeywords) {
    // Если оба — приоритет у запросов со словами "статья/новость"
    responseType = 'articles';
  }

  // Извлекаем тематические ключевые слова
  const keywords = extractKeywords(lower);

  return {
    topic: keywords[0] || lower,
    keywords,
    responseType,
  };
}

/**
 * Извлекает ключевые слова из запроса
 */
function extractKeywords(query: string): string[] {
  const keywords: string[] = [];

  // Тематические маппинги
  const topicMap: Record<string, string[]> = {
    ai: ['ai', 'ии', 'искусственный интеллект', 'machine learning', 'ml', 'нейросет', 'нейронн', 'openai', 'anthropic', 'gemini'],
    agents: ['agents', 'агент', 'ai agent', 'autonomous'],
    llm: ['llm', 'large language model', 'chatgpt', 'gpt', 'claude', 'deepseek'],
    'vibe-coding': ['vibe coding', 'vibe-coding', 'vibe', 'вайбкодинг', 'вайб-кодинг', 'вайб'],
    infra: ['infra', 'инфраструктур', 'devops', 'kubernetes', 'k8s', 'docker'],
    cloud: ['cloud', 'облак', 'aws', 'gcp', 'azure'],
    programming: ['programming', 'разработк', 'coding', 'code', 'язык программирования'],
    security: ['security', 'безопасност', 'cyber', 'защит'],
  };

  for (const [topic, synonyms] of Object.entries(topicMap)) {
    if (synonyms.some(s => query.includes(s))) {
      keywords.push(topic);
    }
  }

  // Если ничего не нашли — берём существительные длиной > 3
  if (keywords.length === 0) {
    const words = query
      .split(/[\s,.!?;:]+/)
      .filter(w => w.length > 3 && !isStopWord(w));
    keywords.push(...words.slice(0, 2));
  }

  return [...new Set(keywords)];
}

/**
 * Стоп-слова для фильтрации
 */
function isStopWord(word: string): boolean {
  const stops = new Set([
    'как', 'что', 'где', 'когда', 'кто', 'почему', 'зачем',
    'есть', 'будет', 'были', 'этот', 'такой', 'какой',
    'новый', 'последний', 'сегодня', 'вчера', 'завтра',
    'мне', 'нам', 'вам', 'ему', 'ей', 'им',
    'можно', 'нужно', 'надо', 'хочу', 'хотел',
  ]);
  return stops.has(word.toLowerCase());
}

/**
 * Проверяет, является ли запрос запросом к статьям
 */
export function isArticleQuery(query: string): boolean {
  const understood = understandQuery(query);
  return understood.responseType === 'articles';
}
