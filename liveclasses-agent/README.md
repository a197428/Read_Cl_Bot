# Article Digest Agent

> AI-агент для ежедневного дайджеста технологических статей с интеллектуальным поиском.

📰 Каждый день в **10:00 по Москве** бот собирает статьи из The New Stack, InfoWorld и Towards Data Science, анализирует их через DeepSeek v3.2 и отправляет лучшие в Telegram.

## Возможности

- **Ежедневный дайджест** — автоматический сбор и анализ статей в 10:00 МСК
- **Agent-first архитектура** — память, принятие решений, понимание контекста
- **Интеллектуальный поиск** — запросы к базе статей через AI
- **De-duplication** — исключение дубликатов по URL и hash
- **Scoring** — оценка статей по источнику, релевантности и глубине
- **Telegram Bot** — `/digest`, `/help`, команды и свободный поиск

## Sources и Scoring

| Источник | Базовый скор |
|----------|-------------|
| The New Stack | 3 |
| InfoWorld | 3 |
| Towards Data Science | 2 |

Дополнительно: релевантность +2, глубина +1. Порог отправки — минимум 5 баллов.

## Быстрый старт

```bash
npm install
cp .env.example .env
cp .dev.vars.example .dev.vars

# D1 database
npm run db:create
npm run db:migrate

# Secrets
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put ADMIN_TELEGRAM_ID

# Deploy
npm run deploy
```

## Структура проекта

```
liveclasses-agent/
├── src/
│   ├── index.ts           # Entry point, cron handler
│   ├── ai.ts              # LLM интеграция, обработка статей
│   ├── database.ts        # D1 operations
│   ├── telegram.ts        # Telegram Bot API
│   ├── types.ts           # TypeScript definitions
│   ├── agent/             # Agent-first компоненты
│   │   ├── decision.ts    # Принятие решений
│   │   ├── understanding.ts  # Понимание запросов
│   │   └── memory.ts      # История и контекст
│   └── articles/          # Парсинг, дедупликация, scoring
│       ├── fetcher.ts     # RSS fetchers
│       ├── dedup.ts       # De-duplication
│       └── scorer.ts      # Article scoring
├── migrations/            # D1 schema
├── wrangler.toml         # Cloudflare config
└── README.md
```

## Agent-first архитектура

```
User Query → Understanding Layer → Decision Layer
                                         ↓
                              Memory Layer (history, context)
                                         ↓
                              Response (articles / general)
```

**Understanding** (`agent/understanding.ts`) — извлекает тему и ключевые слова из запроса пользователя.

**Decision** (`agent/decision.ts`) — определяет тип ответа (articles/general) и стратегию.

**Memory** (`agent/memory.ts`) — накапливает историю запросов, популярные темы, контекст из статей.

## API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/` | GET | Статус сервиса |
| `/telegram-webhook` | POST | Telegram webhook |
| `/api/digest` | POST | Ручной запуск дайджеста |

## Cron

```
0 7 * * *   # 10:00 МСК (07:00 UTC) — ежедневный дайджест
```

## Переменные окружения

```bash
# Secrets (через wrangler secret put)
TELEGRAM_BOT_TOKEN   # От @BotFather
DEEPSEEK_API_KEY     # RouterAI или DeepSeek
ADMIN_TELEGRAM_ID    # Для уведомлений об ошибках

# Vars (wrangler.toml)
MODEL=deepseek/deepseek-v3.2
ROUTERAI_BASE_URL=https://routerai.ru/api/v1
TIMEZONE=Europe/Moscow
```

## Разработка

```bash
npm run dev          # Локальный wrangler dev
npm run typecheck    # TypeScript check
npm test             # Vitest unit tests
npm run deploy       # Деплой в Cloudflare
```

## Модель

**Только `deepseek/deepseek-v3.2`** через RouterAI. Проверка встроена в `ai.ts`:

```typescript
function ensureCorrectModel(config: { model: string }): void {
  if (config.model !== MODEL) {
    throw new Error(`Только модель ${MODEL} разрешена.`);
  }
}
```

---

MIT License