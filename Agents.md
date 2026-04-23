# LiveClasses AI Agent - Архитектура и план разработки

## 📋 Обзор проекта

AI-агент для Cloudflare Workers, который:
1. Ежедневно в 21:55 (МСК) парсит расписание трансляций с https://liveclasses.ru/schedule/
2. Сохраняет данные о трансляциях на завтра в базу данных D1
3. Отправляет уведомления в Telegram за 15 минут до начала каждой трансляции
4. Отвечает на вопросы пользователей о трансляциях через AI (DeepSeek v3.2)
5. Обрабатывает команду "тест" для случайных напоминаний

## 🏗️ Архитектура

### Компоненты Cloudflare

| Компонент | Назначение | Бесплатные лимиты |
|-----------|------------|-------------------|
| **Workers** | Основной код агента (JavaScript/TypeScript) | 100k запросов/день, 10ms CPU/запрос |
| **D1 Database** | Хранение расписания трансляций | 5GB, 5 млн строк, 1 база данных |
| **Cron Triggers** | Запуск по расписанию (21:55 МСК ежедневно) | До 3 триггеров на worker |
| **Workers KV** | Кэширование, хранение состояния | 1GB, 100k операций записи/день |
| **Secrets** | Хранение API ключей | Включено |

### Структура базы данных D1

```sql
-- Таблица трансляций
CREATE TABLE broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,          -- Название трансляции
  start_time TEXT NOT NULL,     -- Время начала (HH:MM)
  start_datetime TEXT NOT NULL, -- Полная дата-время (ISO)
  author TEXT NOT NULL,         -- Автор/преподаватель
  url TEXT NOT NULL,            -- Ссылка на трансляцию
  category TEXT,                -- Категория (опционально)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(title, start_datetime)
);

-- Таблица уведомлений (для отслеживания отправленных)
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  broadcast_id INTEGER NOT NULL,
  notified_at TEXT NOT NULL,    -- Когда отправлено уведомление
  status TEXT DEFAULT 'sent',   -- sent, failed, pending
  FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id)
);

-- Таблица пользователей (если будет несколько пользователей)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 Технические требования

### 1. Парсинг HTML
- Использование `cheerio` или нативных DOM API в Workers
- Поиск раздела "Завтра, {дата}"
- Извлечение: название, время, автор, ссылка
- Обработка времени (Московское время)

### 2. AI интеграция
- **Модель**: ТОЛЬКО `deepseek/deepseek-v3.2`
- **Провайдер**: `routerai.ru`
- **Формат**: OpenAI-совместимый API
- **Контекст**: Использовать данные из D1 для ответов на вопросы

### 3. Telegram Bot
- Webhook или polling (Webhook предпочтительнее для Workers)
- Команды: `/start`, `/help`, `/schedule`
- Обработка текстовых запросов
- Отправка уведомлений за 15 минут до трансляций

### 4. Расписание
- **21:55 МСК**: Ежедневный парсинг и обновление D1
- **Каждые 5 минут**: Проверка предстоящих трансляций (за 15 минут)
- **По запросу**: Ответы на вопросы пользователей

## 📁 Структура проекта

```
liveclasses-agent/
├── src/
│   ├── index.ts              # Основной обработчик Worker
│   ├── parser.ts             # Парсинг HTML liveclasses.ru
│   ├── database.ts           # Работа с D1
│   ├── telegram.ts           # Telegram Bot API
│   ├── ai.ts                 # DeepSeek AI интеграция
│   ├── scheduler.ts          # Логика расписания
│   └── types.ts              # TypeScript типы
├── wrangler.toml            # Конфигурация Cloudflare
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Процесс разработки

### Этап 1: Настройка проекта
1. Инициализация проекта с `wrangler`
2. Создание D1 базы данных
3. Настройка конфигурации

### Этап 2: Парсинг HTML
1. Реализация парсера для liveclasses.ru
2. Тестирование на реальной странице
3. Извлечение структурированных данных

### Этап 3: База данных
1. Создание таблиц в D1
2. CRUD операции для трансляций
3. Логика очистки старых данных перед обновлением

### Этап 4: Telegram Bot
1. Создание бота через @BotFather
2. Настройка Webhook
3. Реализация базовых команд

### Этап 5: AI интеграция
1. Подключение к routerai.ru
2. Проверка использования ТОЛЬКО deepseek/deepseek-v3.2
3. Реализация контекстных ответов на основе D1

### Этап 6: Расписание
1. Настройка Cron Triggers
2. Логика проверки времени
3. Отправка уведомлений

### Этап 7: Тестирование
1. Unit тесты парсера
2. Интеграционные тесты с D1
3. Тестирование AI ответов
4. Проверка уведомлений

## 🔐 Переменные окружения

```bash
# Обязательные
TELEGRAM_BOT_TOKEN=xxx
DEEPSEEK_API_KEY=xxx
ROUTERAI_BASE_URL=https://routerai.ru/api/v1

# Опциональные
ADMIN_TELEGRAM_ID=xxx  # Для уведомлений об ошибках
TIMEZONE=Europe/Moscow
```

## ⚙️ Конфигурация wrangler.toml

```toml
name = "liveclasses-agent"
main = "src/index.ts"
compatibility_date = "2024-04-01"

[[d1_databases]]
binding = "DB"
database_name = "liveclasses-db"
database_id = "xxx"

[triggers]
crons = [
  "55 18 * * *",  # 21:55 МСК (18:55 UTC)
  "*/5 * * * *"   # Каждые 5 минут для проверки уведомлений
]

[vars]
TIMEZONE = "Europe/Moscow"

[env.production]
vars = { ENVIRONMENT = "production" }
```

## 🧪 Тестирование

### Unit тесты
```typescript
// Парсер
test('parse tomorrow section', () => { ... })
test('extract broadcast data', () => { ... })
test('parse time format', () => { ... })

// База данных
test('clear old broadcasts', () => { ... })
test('insert broadcasts', () => { ... })
test('query upcoming broadcasts', () => { ... })

// AI
test('AI uses correct model', () => { ... })
test('AI answers with context', () => { ... })
```

### Интеграционные тесты
1. Полный цикл парсинга → D1 → AI ответ
2. Telegram команды
3. Cron триггеры

### E2E тесты
1. Ежедневный парсинг в 21:55
2. Уведомления за 15 минут
3. Ответы на вопросы пользователей

## 📈 Мониторинг и логи

1. **Cloudflare Workers Analytics** - запросы, ошибки
2. **Telegram Bot logs** - команды пользователей
3. **D1 мониторинг** - использование базы данных
4. **Custom logging** в консоль для отладки

## 🚨 Обработка ошибок

1. **Парсинг**: Повторные попытки, fallback стратегии
2. **API ошибки**: Логирование, уведомление администратору
3. **D1 ошибки**: Валидация данных, транзакции
4. **Telegram**: Обработка таймаутов, повторные отправки

## 🔄 Жизненный цикл данных

1. **21:55**: Удаление всех старых записей из `broadcasts`
2. **21:56**: Парсинг новых трансляций на завтра
3. **21:57**: Сохранение в D1
4. **Каждые 5 минут**: Проверка, какие трансляции начинаются через 15 минут
5. **За 15 минут**: Отправка уведомлений в Telegram
6. **По запросу**: Ответы AI на основе данных D1

## 💡 Особые случаи

### Нет трансляций на завтра
- Отправлять уведомление пользователю
- AI должен сообщать, что трансляций нет

### Ошибка парсинга
- Использовать кэшированные данные (если есть)
- Уведомить администратора
- Повторить через 30 минут

### Множественные пользователи
- Поддержка нескольких Telegram ID
- Персонализированные уведомления

## 🔍 Проверка использования модели

**ВАЖНО**: В коде должна быть явная проверка, что используется ТОЛЬКО `deepseek/deepseek-v3.2`

```typescript
const MODEL = 'deepseek/deepseek-v3.2';

function ensureCorrectModel(config: any) {
  if (config.model !== MODEL) {
    throw new Error(`Только модель ${MODEL} разрешена. Получено: ${config.model}`);
  }
}
```

## 📝 Документация для пользователя

### Команды бота
- `/start` - Приветствие и описание
- `/schedule` - Показать расписание на завтра
- `/next` - Ближайшая трансляция
- `/help` - Справка

### Вопросы к AI
- "Какая ближайшая трансляция?"
- "Что будет завтра в 15:00?"
- "Какие трансляции по фотографии?"
- "Кто ведет завтрашние мастер-классы?"

### Команда "тест"
- Случайное напоминание о ближайших трансляциях
- Формат: "Напоминание: {название} в {время}"

## 🛠️ CLI команды для развертывания

```bash
# Установка зависимостей
npm install

# Локальная разработка
wrangler dev

# Создание D1 базы
wrangler d1 create liveclasses-db

# Применение миграций
wrangler d1 execute liveclasses-db --file=./migrations/001_init.sql

# Деploy
wrangler deploy

# Настройка Webhook Telegram
curl -F "url=https://your-worker.workers.dev/telegram-webhook" \
  https://api.telegram.org/bot{TOKEN}/setWebhook
```

## 📊 Ограничения бесплатного тарифа Cloudflare

1. **Workers**: 100k запросов/день
2. **D1**: 5GB, 5 млн строк, 1 база
3. **Cron Triggers**: До 3 на worker
4. **KV**: 1GB, 100k операций записи/день

**Оценка использования**:
- Парсинг: 1 запрос/день
- Проверка уведомлений: 288 запросов/день (каждые 5 минут)
- Запросы пользователей: ~100 запросов/день
- **Итого**: ~389 запросов/день (в пределах лимита)

## 🔗 Ссылки

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [D1 Database Docs](https://developers.cloudflare.com/d1/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [RouterAI Docs](https://routerai.ru/docs)
- [DeepSeek API](https://platform.deepseek.com/api-docs/)

---

*Документ создан как навык для разработки AI агента трансляций LiveClasses*