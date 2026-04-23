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

export interface AIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
}

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
