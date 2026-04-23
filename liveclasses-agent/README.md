# LiveClasses AI Agent для Cloudflare Workers

AI-агент для отслеживания трансляций LiveClasses с уведомлениями в Telegram.

## 📋 Функционал

✅ **Ежедневный парсинг**: В 21:55 (МСК) автоматически парсит расписание с liveclasses.ru  
✅ **Хранение данных**: Сохраняет трансляции на завтра в Cloudflare D1 Database  
✅ **Уведомления**: Отправляет напоминания в Telegram за 15 минут до начала  
✅ **AI-ассистент**: Отвечает на вопросы о трансляциях через DeepSeek v3.2  
✅ **Telegram Bot**: Команды для получения расписания и поиска  
✅ **Тестовый режим**: Команда "тест" для проверки уведомлений  

## 🏗️ Архитектура

- **Cloudflare Workers**: Основная логика агента
- **D1 Database**: Хранение расписания трансляций
- **Cron Triggers**: Запуск по расписанию (21:55 МСК + каждые 5 минут)
- **Telegram Bot API**: Уведомления и взаимодействие с пользователями
- **RouterAI + DeepSeek v3.2**: AI для ответов на вопросы

## 🚀 Быстрый старт

### 1. Предварительные требования

- Аккаунт Cloudflare (бесплатный)
- Telegram Bot Token от [@BotFather](https://t.me/BotFather)
- API ключ от RouterAI или DeepSeek

### 2. Установка зависимостей

```bash
npm install
```

### 2.1 Локальные ключи и `.env`

1. Скопируйте шаблоны:

```bash
cp .env.example .env
cp .dev.vars.example .dev.vars
```

2. Заполните реальные ключи в `.dev.vars` (используется `wrangler dev` локально).
3. Файл `.env` можно использовать как универсальный локальный reference для ваших инструментов/IDE.
4. Реальные `.env` и `.dev.vars` не коммитьте: они уже исключены в `.gitignore`.

### 3. Создание базы данных D1

```bash
npm run db:create
```

После создания скопируйте `database_id` из вывода в `wrangler.toml`.

### 4. Применение миграций

```bash
npm run db:migrate
```

### 5. Настройка секретов

```bash
# Telegram Bot Token
wrangler secret put TELEGRAM_BOT_TOKEN

# DeepSeek API Key
wrangler secret put DEEPSEEK_API_KEY

# Опционально: Telegram ID администратора
wrangler secret put ADMIN_TELEGRAM_ID
```

Для локальной разработки эти значения берутся из `.dev.vars`.

### 6. Настройка Webhook Telegram

После деплоя (шаг 7) настройте webhook:

```bash
curl -F "url=https://YOUR_WORKER.workers.dev/telegram-webhook" \
  https://api.telegram.org/bot{YOUR_BOT_TOKEN}/setWebhook
```

### 7. Деплой

```bash
npm run deploy
```

## ⚙️ Конфигурация

Файл `wrangler.toml` содержит базовую конфигурацию:

```toml
name = "liveclasses-agent"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "liveclasses-db"
database_id = "..."  # Заполнить после создания базы

[triggers]
crons = [
  "55 18 * * *",  # 21:55 МСК (18:55 UTC)
  "*/5 * * * *"   # Проверка уведомлений каждые 5 минут
]

[vars]
TIMEZONE = "Europe/Moscow"
MODEL = "deepseek/deepseek-v3.2"  # ОЧЕНЬ ВАЖНО: только эта модель
ROUTERAI_BASE_URL = "https://routerai.ru/api/v1"
```

## 🤖 Команды Telegram Bot

### Основные команды
- `/start` - Начало работы и описание
- `/help` - Справка и примеры
- `/schedule` - Расписание на завтра
- `/next` - Ближайшая трансляция
- `/search [запрос]` - Поиск трансляций

### Примеры вопросов AI
- "Какая ближайшая трансляция?"
- "Что будет завтра в 15:00?"
- "Какие трансляции по фотографии?"
- "Кто ведет завтрашние мастер-классы?"

### Специальная команда
- **"тест"** - Случайное тестовое напоминание

## 🔧 Локальная разработка

```bash
# Запуск локального сервера
npm run dev

# Проверка типов TypeScript
npm run typecheck

# Тестирование парсера
curl http://localhost:8787/api/parse

# Тестирование базы данных
curl http://localhost:8787/api/broadcasts

# Тестирование AI
curl -X POST http://localhost:8787/api/ai \
  -H "Content-Type: application/json" \
  -d '{"question": "Какая ближайшая трансляция?"}'
```

## 📊 API эндпоинты

### `GET /`
Статус сервиса и список эндпоинтов.

### `POST /telegram-webhook`
Webhook для Telegram Bot API.

### `GET /api/parse`
Ручной запуск парсинга расписания.

### `GET /api/broadcasts`
Получение списка трансляций на завтра.

### `POST /api/ai`
Запрос к AI с вопросом о трансляциях.

## 🧪 Тестирование

### Парсер
```typescript
import { testParser } from './src/parser';

// Тест на реальном HTML
const html = await fetch('https://liveclasses.ru/schedule/').then(r => r.text());
const results = testParser(html);
```

### Интеграционные тесты (данные + TZ + уведомления)

```bash
npm test
```

Текущие integration-сценарии проверяют:
- конвертацию "завтра по МСК" в UTC `start_datetime`
- очистку старых данных и сохранение нового расписания
- выборку "трансляции на завтра"
- логику окна уведомлений за 15 минут

### AI валидация модели
```typescript
import { testModelValidation } from './src/ai';
testModelValidation(); // Проверяет использование правильной модели
```

## 🔐 Важные ограничения

### Модель AI
**ОЧЕНЬ ВАЖНО**: В коде используется ТОЛЬКО `deepseek/deepseek-v3.2`.
Проверка встроена в `src/ai.ts`:

```typescript
function ensureCorrectModel(config: any): void {
  if (config.model !== 'deepseek/deepseek-v3.2') {
    throw new Error(`Только модель deepseek/deepseek-v3.2 разрешена.`);
  }
}
```

### Ограничения бесплатного тарифа Cloudflare
- Workers: 100k запросов/день
- D1 Database: 5GB, 5 млн строк
- Cron Triggers: до 3 на worker
- KV Storage: 1GB, 100k операций записи/день

## 🚨 Обработка ошибок

### Парсинг
- Повторные попытки при ошибках сети
- Логирование ошибок в консоль
- Уведомление администратора через Telegram

### База данных
- Транзакции для целостности данных
- Валидация данных перед сохранением
- Резервное копирование через миграции

### Telegram
- Обработка таймаутов API
- Повторные отправки при ошибках
- Отказоустойчивость при недоступности

## 📁 Структура проекта

```
liveclasses-agent/
├── src/
│   ├── index.ts          # Основной обработчик Worker
│   ├── parser.ts         # Парсинг HTML liveclasses.ru
│   ├── database.ts       # Работа с D1 Database
│   ├── telegram.ts       # Telegram Bot API
│   ├── ai.ts             # DeepSeek AI интеграция
│   └── types.ts          # TypeScript типы
├── migrations/
│   └── 001_init.sql      # Инициализация базы данных
│   └── 002_seed.sql      # Тестовые данные для локальной разработки
├── wrangler.toml         # Конфигурация Cloudflare
├── .dev.vars.example     # Шаблон локальных секретов Wrangler
├── .env.example          # Шаблон переменных окружения
├── package.json
├── tsconfig.json
└── README.md
```

## 🔄 Жизненный цикл данных

1. **21:55 МСК**: Удаление старых данных + парсинг новых трансляций
2. **21:56**: Сохранение в D1 Database
3. **Каждые 5 минут**: Проверка предстоящих трансляций
4. **За 15 минут**: Отправка уведомлений в Telegram
5. **По запросу**: Ответы AI на вопросы пользователей

## 📞 Поддержка

### Мониторинг
- Cloudflare Workers Analytics
- Telegram Bot logs
- Консольные логи

### Уведомления администратора
- Ошибки парсинга
- Ошибки базы данных
- Статистика работы

## ✅ CLI Чеклист Деплоя

1. Установить зависимости:
```bash
npm install
```
2. Создать D1 базу:
```bash
npm run db:create
```
3. Вставить `database_id` в `wrangler.toml` (`[[d1_databases]]`).
4. Применить миграции:
```bash
npm run db:migrate
```
5. Добавить секреты:
```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put ADMIN_TELEGRAM_ID
```
6. Проверить типы и тесты:
```bash
npm run typecheck
npm test
```
7. Задеплоить Worker:
```bash
npm run deploy
```
8. Установить Telegram webhook:
```bash
curl -F "url=https://YOUR_WORKER.workers.dev/telegram-webhook" \
  https://api.telegram.org/bot{YOUR_BOT_TOKEN}/setWebhook
```
9. Проверить health endpoint:
```bash
curl https://YOUR_WORKER.workers.dev/
```
10. Проверить ручной парсинг и данные:
```bash
curl https://YOUR_WORKER.workers.dev/api/parse
curl https://YOUR_WORKER.workers.dev/api/broadcasts
```

## 📝 Лицензия

MIT

---

**Важно**: Этот агент использует только модель `deepseek/deepseek-v3.2` через RouterAI.
Любые изменения модели должны быть явно согласованы и проверены.
