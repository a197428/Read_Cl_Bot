# Article Digest Agent

> AI-агент для Cloudflare Workers — ежедневный дайджест технологических статей.

## Возможности

- Парсинг RSS: The New Stack, InfoWorld, Towards Data Science
- AI-анализ через DeepSeek v3.2 (только эта модель)
- De-duplication по URL и hash
- Scoring по источнику, релевантности, глубине
- Telegram доставка с командами `/start`, `/help`, `/digest`
- Agent-first память и принятие решений

## Установка

```bash
npm install
cp .env.example .env
cp .dev.vars.example .dev.vars

# База данных D1
npm run db:create
npm run db:migrate

# Secrets
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put ADMIN_TELEGRAM_ID

# Deploy
npm run deploy

# Telegram webhook
curl -F "url=https://YOUR-WORKER.workers.dev/telegram-webhook" \
  https://api.telegram.org/bot{TOKEN}/setWebhook
```

## Структура кода

```
src/
├── index.ts           # Worker entry point, cron handler
├── ai.ts              # LLM интеграция, обработка статей
├── database.ts        # D1 CRUD operations
├── telegram.ts        # Bot API, команды, отправка
├── types.ts           # TypeScript definitions
├── agent/
│   ├── decision.ts    # Принятие решений
│   ├── understanding.ts  # Понимание запросов
│   └── memory.ts      # История, контекст
└── articles/
    ├── fetcher.ts     # RSS fetchers
    ├── dedup.ts       # De-duplication
    └── scorer.ts      # Article scoring
```

## Agent-first поток

```
Telegram Update → handleTelegramUpdate
                        ↓
              handleCommand / handleTextMessage
                        ↓
              decideResponse (agent/decision.ts)
                        ↓
              queryArticlesByTopic / askLLMForTopicAnalysis
                        ↓
              sendMessage → User
```

## API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/` | GET | Статус сервиса |
| `/telegram-webhook` | POST | Telegram webhook |
| `/api/digest` | POST | Ручной запуск дайджеста |

## Разработка

```bash
npm run dev          # wrangler dev
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run deploy       # wrangler deploy
```

## Модель — проверка

```typescript
const MODEL = 'deepseek/deepseek-v3.2';

function ensureCorrectModel(config: { model: string }): void {
  if (config.model !== MODEL) {
    throw new Error(`Только модель ${MODEL} разрешена.`);
  }
}
```

## Конфигурация

```bash
# wrangler.toml (vars)
MODEL=deepseek/deepseek-v3.2
ROUTERAI_BASE_URL=https://routerai.ru/api/v1
TIMEZONE=Europe/Moscow

# wrangler secret put
TELEGRAM_BOT_TOKEN
DEEPSEEK_API_KEY
ADMIN_TELEGRAM_ID
```

---

MIT