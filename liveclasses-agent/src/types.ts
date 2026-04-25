// ============================================================================
// Legacy types — broadcasts / notifications / users
// ============================================================================

export interface Broadcast {
  id?: number;
  title: string;
  start_time: string; // HH:MM
  start_datetime: string; // ISO 8601
  author: string;
  url: string;
  category?: string;
  created_at?: string;
}

export interface Notification {
  id?: number;
  broadcast_id: number;
  notified_at: string;
  status: 'sent' | 'failed' | 'pending';
}

export interface User {
  id?: number;
  telegram_id: string;
  username?: string;
  created_at?: string;
}

// ============================================================================
// Telegram types
// ============================================================================

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
    language_code?: string;
  };
  chat: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
    first_name?: string;
  };
  date: number;
  text?: string;
  entities?: any[];
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: any;
}

// ============================================================================
// AI / Environment / Config
// ============================================================================

export interface AIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
}

export interface Environment {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  DEEPSEEK_API_KEY: string;
  ROUTERAI_BASE_URL: string;
  MODEL: string;
  TIMEZONE: string;
  ADMIN_TELEGRAM_ID?: string;
  ENVIRONMENT: 'development' | 'production';
}

export interface CronEvent {
  type: 'cron';
  scheduledTime: number;
  cron: string;
}

export interface RequestEvent {
  request: Request;
  env: Environment;
  ctx: ExecutionContext;
}

export type WorkerEvent = CronEvent | RequestEvent;

export interface AIQueryRequestBody {
  question?: string;
}

// ============================================================================
// Parser types
// ============================================================================

export interface ParserResult {
  title: string;
  start_time: string; // HH:MM
  author: string;
  url: string;
  category?: string;
}

export interface BroadcastInput {
  title: string;
  start_time: string; // HH:MM
  author: string;
  url: string;
  category?: string;
}

// ============================================================================
// Article types — NEW (AI Agent layer)
// ============================================================================

/** Источник статей */
export type ArticleSource = 'thenewstack' | 'infoworld' | 'tds';

/** RSS-элемент до обработки */
export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  source: ArticleSource;
}

/** Запись в articles_seen (дедупликация) */
export interface ArticleSeen {
  id?: number;
  url: string;
  url_hash: string;
  source: ArticleSource;
  discovered_at?: string;
}

/** Результат LLM-обработки статьи (JSON) */
export interface ArticleLLMResult {
  summary: string;
  practical_value: string;
  key_ideas: string[];
  simple_explanation: string;
  conclusion: string;
  tags: string[];
  relevance_score: number; // 0..2
  depth_score: number;     // 0..1
}

/** Полная обработанная статья */
export interface ProcessedArticle {
  id?: number;
  seen_id: number;
  title: string;
  summary: string;
  practical_value?: string;
  key_ideas: string[];
  simple_explanation?: string;
  conclusion?: string;
  tags: string[];
  score: number;
  source_score: number;
  relevance_score: number;
  depth_score: number;
  processed_at?: string;
  url: string;
}

/** История запроса пользователя (memory) */
export interface UserQuery {
  id?: number;
  telegram_id?: string;
  query: string;
  extracted_topic?: string;
  response_type: 'broadcasts' | 'articles' | 'general';
  created_at?: string;
}

/** Тип ответа агента */
export type AgentResponseType = 'broadcasts' | 'articles' | 'general';

/** Тема, извлечённая из запроса */
export interface ExtractedTopic {
  topic: string;
  keywords: string[];
  responseType: AgentResponseType;
}

/** Конфигурация источника RSS */
export interface RssSourceConfig {
  name: ArticleSource;
  url: string;
  baseScore: number;
}
