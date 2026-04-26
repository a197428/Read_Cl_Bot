# Read-Close-Bot

> AI-агент для ежедневного дайджеста технологических статей с интеллектуальным поиском.

📰 Каждый день в 10:00 по Москве бот собирает статьи из The New Stack, InfoWorld и Towards Data Science, анализирует их через DeepSeek v3.2 и отправляет лучшие в Telegram.

## Возможности

- **Ежедневный дайджест** — автоматический сбор и анализ статей в 10:00 МСК
- **Agent-first архитектура** — память, принятие решений, понимание контекста
- **Интеллектуальный поиск** — запросы к базе статей через AI
- **De-duplication** — исключение дубликатов по URL и hash
- **Scoring** — оценка статей по источнику, релевантности и глубине
- **Telegram Bot** — `/digest`, `/help`, команды и свободный поиск

## Tech Stack

| Компонент | Назначение |
|-----------|------------|
| **Cloudflare Workers** | Рантайм агента |
| **Cloudflare D1** | Хранение статей и истории |
| **Cron Triggers** | Ежедневный запуск в 10:00 МСК |
| **RouterAI + DeepSeek v3.2** | AI-анализ статей |
| **Telegram Bot API** | Доставка дайджеста |

## Sources и Scoring

| Источник | Базовый скор |
|----------|-------------|
| The New Stack | 3 |
| InfoWorld | 3 |
| Towards Data Science | 2 |

Дополнительно: релевантность +2, глубина +1. Порог отправки — минимум 5 баллов.

## Быстрый старт

```bash
cd liveclasses-agent
npm install
cp .env.example .env
cp .dev.vars.example .dev.vars
npm run db:create
npm run db:migrate
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put ADMIN_TELEGRAM_ID
npm run deploy
```

## Структура проекта

```
READ-CL-BOT/
├── liveclasses-agent/     # Основной код Cloudflare Worker
│   ├── src/
│   │   ├── index.ts       # Entry point, cron handler
│   │   ├── ai.ts          # LLM интеграция, обработка статей
│   │   ├── database.ts    # D1 operations
│   │   ├── telegram.ts    # Telegram Bot API
│   │   ├── types.ts       # TypeScript definitions
│   │   ├── agent/         # Agent-first компоненты
│   │   │   ├── decision.ts    # Принятие решений
│   │   │   ├── understanding.ts  # Понимание запросов
│   │   │   └── memory.ts      # История и контекст
│   │   └── articles/      # Парсинг, дедупликация, scoring
│   │       ├── fetcher.ts
│   │       ├── dedup.ts
│   │       └── scorer.ts
│   └── migrations/
├── Agents.md              # Полная архитектура системы
└── README.md              # Этот файл
```

## Агент — внутренняя архитектура

```
User Query → Understanding Layer → Decision Layer
                                         ↓
                              Memory Layer (history, context)
                                         ↓
                              Response (articles / general)
```

**Понимание** (`understanding.ts`) — извлекает тему и ключевые слова из запроса пользователя.

**Решение** (`decision.ts`) — определяет тип ответа (articles/general) и стратегию.

**Память** (`memory.ts`) — накапливает историю запросов, популярные темы, контекст из статей.

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

## Конфигурация

```bash
# Обязательные секреты
TELEGRAM_BOT_TOKEN   # От @BotFather
DEEPSEEK_API_KEY     # RouterAI или DeepSeek API
ADMIN_TELEGRAM_ID    # Для уведомлений об ошибках

# Переменные (wrangler.toml)
MODEL=deepseek/deepseek-v3.2
ROUTERAI_BASE_URL=https://routerai.ru/api/v1
TIMEZONE=Europe/Moscow
```

## Разработка

```bash
npm run dev      # Локальный wrangler dev
npm run typecheck
npm test         # Vitest unit tests
npm run deploy   # Деплой в Cloudflare
```

## Модель

**Только `deepseek/deepseek-v3.2`** через RouterAI. Проверка встроена в `ai.ts`.

---

MIT License