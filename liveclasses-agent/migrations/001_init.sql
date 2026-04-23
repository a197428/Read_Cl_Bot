-- Создание таблицы трансляций
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,           -- Время начала (HH:MM)
  start_datetime TEXT NOT NULL,       -- Полная дата-время (ISO 8601)
  author TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(title, start_datetime)
);

-- Создание таблицы уведомлений
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  broadcast_id INTEGER NOT NULL,
  notified_at TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE
);

-- Создание таблицы пользователей (для будущего расширения)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_broadcasts_datetime ON broadcasts(start_datetime);
CREATE INDEX IF NOT EXISTS idx_broadcasts_date ON broadcasts(date(start_datetime));
CREATE INDEX IF NOT EXISTS idx_notifications_broadcast ON notifications(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);