-- Таблица пользователей (для доставки дайджеста)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
