# Read-Close-Bot

> AI-агент для ежедневного дайджеста технологических статей. Работает на **Cloudflare Workers** (Free Tier).

📰 Каждый день в **10:00 по Москве** бот собирает статьи из The New Stack, InfoWorld и Towards Data Science, анализирует их через DeepSeek v3.2 и отправляет лучшие в Telegram.

## 🏗️ Cloudflare Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
│                                                             │
│   ┌─────────┐    ┌──────────┐    ┌────────────┐            │
│   │  Cron   │───▶│  Agent   │───▶│   Telegram  │            │
│   │ Trigger │    │ (index)  │    │     Bot     │            │
│   └─────────┘    └────┬─────┘    └────────────┘            │
│                      │                                      │
│   ┌──────────────────┴──────────────────┐                   │
│   │            D1 Database              │                   │
│   │  • articles_seen (URLs, hashes)    │                   │
│   │  • articles_processed (AI analysis) │                   │
│   │  • user_queries (history)           │                   │
│   └─────────────────────────────────────┘                   │
│                                                             │
│   Sources: The New Stack, InfoWorld, TDS                    │
│   AI: RouterAI + DeepSeek v3.2                              │
└─────────────────────────────────────────────────────────────┘
```

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
cd liveclasses-agent
npm install

# Secrets
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put ADMIN_TELEGRAM_ID

npm run deploy
```

## Структура проекта

```
READ-CL-BOT/
├── liveclasses-agent/     # Cloudflare Worker
│   ├── src/
│   │   ├── index.ts       # Entry point, cron handler
│   │   ├── ai.ts          # LLM интеграция
│   │   ├── database.ts    # D1 operations
│   │   ├── telegram.ts    # Telegram Bot API
│   │   ├── agent/         # Agent-first компоненты
│   │   └── articles/      # RSS fetchers, dedup, scoring
│   └── migrations/        # D1 schema
├── Agents.md              # Полная архитектура системы
└── README.md
```

## Agent-first архитектура

```
User Query → Understanding → Decision → Memory → Response
```

Слои агента:
- **Understanding** — извлекает тему из запроса
- **Decision** — определяет тип ответа (articles/general)
- **Memory** — накапливает историю и контекст
- **Response** — формирует ответ на основе статей

## Cloudflare Stack

| Компонент | Назначение | Лимит Free Tier |
|-----------|------------|-----------------|
| **Workers** | Рантайм агента | 100k req/day, 10ms CPU |
| **D1 Database** | Хранение статей и истории | 5GB, 5M rows |
| **Cron Triggers** | Ежедневный запуск в 10:00 МСК | до 3 на worker |

## Cron

```
0 7 * * *   # 10:00 МСК (07:00 UTC) — ежедневный дайджест
```

## Модель

**Только `deepseek/deepseek-v3.2`** через RouterAI. Проверка встроена в код.

---

MIT