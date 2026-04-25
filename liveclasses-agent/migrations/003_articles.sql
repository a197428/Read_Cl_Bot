-- ============================================================================
-- Миграция 003: AI-агент — статьи, дайджесты, история запросов
-- ============================================================================

-- Таблица уникальности статей (дедупликация по URL + hash)
CREATE TABLE IF NOT EXISTS articles_seen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  url_hash TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('thenewstack','infoworld','tds')),
  discovered_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Таблица обработанных статей (LLM-анализ)
CREATE TABLE IF NOT EXISTS articles_processed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seen_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  practical_value TEXT,
  key_ideas TEXT,          -- JSON array
  simple_explanation TEXT,
  conclusion TEXT,
  tags TEXT,               -- JSON array
  score INTEGER DEFAULT 0,
  source_score INTEGER DEFAULT 0,
  relevance_score INTEGER DEFAULT 0,
  depth_score INTEGER DEFAULT 0,
  processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  url TEXT NOT NULL,
  FOREIGN KEY (seen_id) REFERENCES articles_seen(id) ON DELETE CASCADE
);

-- Таблица истории запросов пользователей (memory)
CREATE TABLE IF NOT EXISTS user_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT,
  query TEXT NOT NULL,
  extracted_topic TEXT,
  response_type TEXT DEFAULT 'general' CHECK(response_type IN ('broadcasts','articles','general')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Индексы для производительности
-- ============================================================================

-- Быстрая проверка дублей
CREATE INDEX IF NOT EXISTS idx_articles_seen_hash ON articles_seen(url_hash);

-- Фильтрация по источнику
CREATE INDEX IF NOT EXISTS idx_articles_seen_source ON articles_seen(source);

-- Поиск по тегам (LIKE %tag%)
CREATE INDEX IF NOT EXISTS idx_articles_processed_tags ON articles_processed(tags);

-- Сортировка по скору (топ-N)
CREATE INDEX IF NOT EXISTS idx_articles_processed_score ON articles_processed(score DESC);

-- Фильтрация по дате (статьи за последние N дней)
CREATE INDEX IF NOT EXISTS idx_articles_processed_date ON articles_processed(processed_at);

-- История по темам
CREATE INDEX IF NOT EXISTS idx_user_queries_topic ON user_queries(extracted_topic);
