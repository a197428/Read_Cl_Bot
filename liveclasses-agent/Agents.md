# LiveClasses AI Agent v2.0 — Архитектура

## 📋 Обзор

AI-агент на Cloudflare Workers, который:
1. **Ежедневно в 21:55 (МСК)** парсит расписание трансляций с liveclasses.ru
2. **Сохраняет** данные о трансляциях в D1
3. **Отправляет уведомления** в Telegram за 15 минут до начала
4. **Отвечает на вопросы** пользователей о трансляциях через AI (DeepSeek v3.2)
5. **Ежедневно в 10:00 (МСК)** собирает дайджест статей из RSS (The New Stack, InfoWorld, TDS)
6. **Обрабатывает статьи** через LLM (summary, tags, scoring)
7. **Отвечает на тематические запросы** по статьям ("что нового по AI?")

---

## 🏗️ Архитектура (Agent-First)

```
src/
├── index.ts              # Entry point: fetch + scheduled handlers
├── types.ts              # All TypeScript interfaces
├── parser.ts             # HTML парсер liveclasses.ru (legacy)
├── database.ts           # D1 CRUD: broadcasts + articles + queries
├── telegram.ts           # Telegram Bot API + новые команды
├── ai.ts                 # LLM интеграция: queryAI + processArticle + topicSearch
├── time.ts               # Временные утилиты
├── articles/
│   ├── fetcher.ts        # RSS fetcher (The New Stack, InfoWorld, TDS)
│   ├── dedup.ts          # SHA256 дедупликация по URL
│   ├── scorer.ts         # Базовый скоринг + LLM скоринг
│   ├── fetcher.test.ts   # Тесты fetcher
│   └── scorer.test.ts    # Тесты scorer
└── agent/
    ├── understanding.ts  # Topic extraction из запроса
    ├── decision.ts       # Decision logic (articles vs broadcasts)
    ├── memory.ts         # История запросов (user_queries)
    └── understanding.test.ts # Тесты understanding
```

---

## 🧠 Agent Layer

```
Пользователь → Telegram
  → understanding.ts (извлечь тему)
  → decision.ts (статьи или трансляции?)
  → memory.ts (сохранить запрос)
  → database.ts (поиск в D1)
  → ai.ts (LLM fallback если нет данных)
  → telegram.ts (ответ пользователю)
```

---

## 📦 D1 Схема

### Legacy (сохранены)
- `broadcasts` — трансляции
- `notifications` — уведомления
- `users` — пользователи бота

### New (миграция 003)
- `articles_seen` — дедупликация (url, hash, source)
- `articles_processed` — LLM-анализ (title, summary, tags, score)
- `user_queries` — история запросов (memory)

---

## ⚙️ Pipeline статей (ежедневно 10:00)

```
RSS fetch → filter new (dedup) → LLM process → save to D1 → rank → send digest
```

**Лимит**: 1-2 статьи за запуск (экономия API)

---

## 📊 Скоринг

| Фактор | Балл |
|--------|------|
| The New Stack | +3 |
| InfoWorld | +3 |
| TDS | +2 |
| relevance_score (LLM) | +0..2 |
| depth_score (LLM) | +0..1 |

---

## ⏰ Cron

```
55 18 * * *   # 21:55 МСК — парсинг трансляций
*/5 * * * *   # Каждые 5 минут — уведомления
0 7 * * *     # 10:00 МСК — дайджест статей
```

---

## 📩 Telegram Команды

| Команда | Описание |
|---------|----------|
| `/start` | Приветствие |
| `/help` | Справка |
| `/schedule` | Расписание на завтра |
| `/next` | Ближайшая трансляция |
| `/search [запрос]` | Поиск трансляций |
| `/digest` | Последний дайджест статей |

**Текстовые запросы**:
- "что нового по AI?" → поиск по статьям
- "что будет завтра?" → расписание трансляций

---

## 🔐 Переменные окружения

```bash
TELEGRAM_BOT_TOKEN=xxx
DEEPSEEK_API_KEY=xxx
ADMIN_TELEGRAM_ID=xxx  # опционально
```

---

## 🚀 Деплой

```bash
# Миграция БД
npm run db:migrate:articles

# Деплой
npm run deploy

# Тесты
npm test
npm run typecheck
```
