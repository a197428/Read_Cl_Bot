import { TelegramUpdate, Environment } from './types';
import { getAllBroadcasts, getNextBroadcast, searchBroadcasts, getBroadcastsForTomorrow, upsertUser } from './database';
import { queryAI } from './ai';

const TELEGRAM_API_URL = 'https://api.telegram.org/bot';
const TELEGRAM_SAFE_MESSAGE_LIMIT = 3500;

/**
 * Обрабатывает обновление от Telegram
 */
export async function handleTelegramUpdate(update: TelegramUpdate, env: Environment): Promise<void> {
  try {
    if (!update.message || !update.message.text) {
      return;
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const username = update.message.from.username || update.message.from.first_name;

    console.log(`Received message from ${username}: ${text}`);

    // Сохраняем пользователя для будущих уведомлений
    await upsertUser(env.DB, String(chatId), username);

    // Обработка команд
    if (text.startsWith('/')) {
      await handleCommand(text, chatId, env);
    } else {
      // Обработка текстовых сообщений
      await handleTextMessage(text, chatId, env, username);
    }
  } catch (error) {
    console.error('Error handling Telegram update:', error);
  }
}

/**
 * Обрабатывает команды
 */
async function handleCommand(command: string, chatId: number, env: Environment): Promise<void> {
  const cmd = command.split(' ')[0].toLowerCase();

  switch (cmd) {
    case '/start':
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `👋 Привет! Я бот для отслеживания трансляций LiveClasses.\n\n` +
        `Я буду присылать уведомления за 15 минут до начала трансляций.\n\n` +
        `📋 Доступные команды:\n` +
        `/start - показать это сообщение\n` +
        `/help - справка\n` +
        `/schedule - расписание на завтра\n` +
        `/next - ближайшая трансляция\n` +
        `/search [запрос] - поиск трансляций\n\n` +
        `💬 Также можете задавать вопросы:\n` +
        `• "Какая ближайшая трансляция?"\n` +
        `• "Что будет завтра в 15:00?"\n` +
        `• "Какие трансляции по фотографии?"\n\n` +
        `🔔 Уведомления приходят автоматически за 15 минут до начала.`
      );
      break;

    case '/help':
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `🤖 *Помощь*\n\n` +
        `📋 *Команды:*\n` +
        `/start - начать работу\n` +
        `/schedule - расписание на завтра\n` +
        `/next - ближайшая трансляция\n` +
        `/search [текст] - поиск трансляций\n\n` +
        `💬 *Примеры вопросов:*\n` +
        `• Какая ближайшая трансляция?\n` +
        `• Что будет завтра утром?\n` +
        `• Какие мастер-классы по дизайну?\n` +
        `• Кто ведет завтрашние трансляции?\n\n` +
        `🔔 *Уведомления:*\n` +
        `Автоматически за 15 минут до начала каждой трансляции.\n\n` +
        `⚙️ *Тест:*\n` +
        `Отправьте "тест" для случайного напоминания.`
      );
      break;

    case '/schedule':
      await handleScheduleCommand(chatId, env);
      break;

    case '/next':
      await handleNextCommand(chatId, env);
      break;

    case '/search':
      const query = command.substring(cmd.length + 1).trim();
      if (query) {
        await handleSearchCommand(query, chatId, env);
      } else {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          chatId,
          '🔍 Пожалуйста, укажите поисковый запрос:\n`/search фотография`'
        );
      }
      break;

    default:
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `❌ Неизвестная команда. Используйте /help для списка команд.`
      );
  }
}

/**
 * Обрабатывает команду /schedule
 */
async function handleScheduleCommand(chatId: number, env: Environment): Promise<void> {
  try {
    const broadcasts = await getBroadcastsForTomorrow(env.DB);

    if (broadcasts.length === 0) {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `📅 На завтра трансляций не найдено.\n` +
        `Попробуйте позже или проверьте /next для ближайшей трансляции.`
      );
      return;
    }

    // Группируем по времени для удобства чтения
    const groupedByTime: Record<string, typeof broadcasts> = {};
    
    broadcasts.forEach(broadcast => {
      if (!groupedByTime[broadcast.start_time]) {
        groupedByTime[broadcast.start_time] = [];
      }
      groupedByTime[broadcast.start_time].push(broadcast);
    });

    const chunks: string[] = [];
    let currentChunk = `📅 *Расписание на завтра:*\n\n`;

    for (const [time, timeBroadcasts] of Object.entries(groupedByTime).sort()) {
      let section = `🕐 *${time}*\n`;
      for (const broadcast of timeBroadcasts) {
        const categoryEmoji = getCategoryEmoji(broadcast.category);
        section += `${categoryEmoji} ${broadcast.title}\n`;
        section += `   👨‍🏫 ${broadcast.author}\n`;
        section += `   🔗 [Ссылка](${broadcast.url})\n\n`;
      }

      if (currentChunk.length + section.length > TELEGRAM_SAFE_MESSAGE_LIMIT) {
        chunks.push(currentChunk.trimEnd());
        currentChunk = `📅 *Расписание на завтра (продолжение):*\n\n`;
      }
      currentChunk += section;
    }

    const summary = `Всего: ${broadcasts.length} трансляций\n🔔 Уведомления придут за 15 минут до начала.`;
    if (currentChunk.length + summary.length > TELEGRAM_SAFE_MESSAGE_LIMIT) {
      chunks.push(currentChunk.trimEnd());
      currentChunk = summary;
    } else {
      currentChunk += summary;
    }
    chunks.push(currentChunk.trimEnd());

    for (const chunk of chunks) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, chunk);
    }
  } catch (error) {
    console.error('Error handling schedule command:', error);
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      '❌ Ошибка при получении расписания. Попробуйте позже.'
    );
  }
}

/**
 * Обрабатывает команду /next
 */
async function handleNextCommand(chatId: number, env: Environment): Promise<void> {
  try {
    const nextBroadcast = await getNextBroadcast(env.DB);

    if (!nextBroadcast) {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `📭 Ближайших трансляций не найдено.\n` +
        `Проверьте /schedule для полного расписания.`
      );
      return;
    }

    const categoryEmoji = getCategoryEmoji(nextBroadcast.category);
    const timeLeft = calculateTimeLeft(nextBroadcast.start_datetime);

    let message = `⏭️ *Ближайшая трансляция:*\n\n`;
    message += `${categoryEmoji} *${nextBroadcast.title}*\n\n`;
    message += `👨‍🏫 ${nextBroadcast.author}\n`;
    message += `🕐 ${nextBroadcast.start_time} (МСК)\n`;
    message += `⏳ Начнется ${timeLeft}\n`;
    message += `🔗 [Ссылка на трансляцию](${nextBroadcast.url})\n\n`;

    if (timeLeft.includes('через 15 минут')) {
      message += `🔔 Уведомление будет отправлено скоро!`;
    } else if (timeLeft.includes('менее чем через 15 минут')) {
      message += `🔔 Уведомление уже отправлено или скоро будет!`;
    } else {
      message += `🔔 Уведомление придет за 15 минут до начала.`;
    }

    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, message);
  } catch (error) {
    console.error('Error handling next command:', error);
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      '❌ Ошибка при поиске ближайшей трансляции.'
    );
  }
}

/**
 * Обрабатывает команду /search
 */
async function handleSearchCommand(query: string, chatId: number, env: Environment): Promise<void> {
  try {
    const broadcasts = await searchBroadcasts(env.DB, query);

    if (broadcasts.length === 0) {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `🔍 По запросу "${query}" ничего не найдено.\n` +
        `Попробуйте другой запрос или проверьте /schedule.`
      );
      return;
    }

    let message = `🔍 *Результаты поиска "${query}":*\n\n`;
    
    // Ограничиваем количество результатов
    const limitedResults = broadcasts.slice(0, 10);
    
    for (const broadcast of limitedResults) {
      const categoryEmoji = getCategoryEmoji(broadcast.category);
      message += `${categoryEmoji} *${broadcast.title}*\n`;
      message += `   👨‍🏫 ${broadcast.author}\n`;
      message += `   🕐 ${broadcast.start_time}\n`;
      message += `   🔗 [Ссылка](${broadcast.url})\n\n`;
    }

    if (broadcasts.length > 10) {
      message += `\n... и еще ${broadcasts.length - 10} трансляций.\n`;
    }

    message += `Всего найдено: ${broadcasts.length}`;

    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, message);
  } catch (error) {
    console.error('Error handling search command:', error);
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      '❌ Ошибка при поиске. Попробуйте позже.'
    );
  }
}

/**
 * Обрабатывает текстовые сообщения (включая "тест")
 */
async function handleTextMessage(text: string, chatId: number, env: Environment, username: string): Promise<void> {
  try {
    // Специальная команда "тест"
    if (text.toLowerCase() === 'тест') {
      await handleTestCommand(chatId, env);
      return;
    }

    // Обработка вопросов через AI
    const answer = await queryAI(text, env);
    
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      `🤖 *Ответ на ваш вопрос:*\n\n${answer}`
    );
  } catch (error) {
    console.error('Error handling text message:', error);
    
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      '❌ Ошибка при обработке сообщения. Попробуйте позже.'
    );
  }
}

/**
 * Обрабатывает команду "тест" - случайное напоминание
 */
async function handleTestCommand(chatId: number, env: Environment): Promise<void> {
  try {
    const broadcasts = await getAllBroadcasts(env.DB);

    if (broadcasts.length === 0) {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `📭 Трансляций для теста не найдено.\n` +
        `Сначала выполните парсинг расписания.`
      );
      return;
    }

    // Выбираем случайную трансляцию
    const randomBroadcast = broadcasts[Math.floor(Math.random() * broadcasts.length)];
    const categoryEmoji = getCategoryEmoji(randomBroadcast.category);

    const message = `🔔 *Тестовое напоминание:*\n\n` +
      `Скоро начнется трансляция!\n\n` +
      `${categoryEmoji} *${randomBroadcast.title}*\n` +
      `👨‍🏫 ${randomBroadcast.author}\n` +
      `🕐 ${randomBroadcast.start_time} (МСК)\n` +
      `🔗 [Ссылка на трансляцию](${randomBroadcast.url})\n\n` +
      `⚠️ Это тестовое сообщение. Настоящие уведомления приходят за 15 минут до начала.`;

    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, message);
  } catch (error) {
    console.error('Error handling test command:', error);
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      '❌ Ошибка при отправке тестового напоминания.'
    );
  }
}

/**
 * Отправляет сообщение через Telegram API
 */
export async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  try {
    const url = `${TELEGRAM_API_URL}${token}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Telegram API error:', response.status, errorText);
      throw new Error(`Telegram API error: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    throw error;
  }
}

/**
 * Отправляет уведомление (используется для напоминаний)
 */
export async function sendNotification(token: string, chatId: string, text: string): Promise<void> {
  try {
    const url = `${TELEGRAM_API_URL}${token}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Telegram notification error:', response.status, errorText);
      throw new Error(`Telegram notification error: ${response.status}`);
    }

    console.log(`Notification sent to ${chatId}`);
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
    throw error;
  }
}

/**
 * Возвращает emoji для категории
 */
function getCategoryEmoji(category?: string): string {
  if (!category) return '📺';
  
  const emojiMap: Record<string, string> = {
    'Графика и дизайн': '🎨',
    'Видео и звук': '🎬',
    'Фотография': '📷',
    'Искусство': '🏛️',
    'Общее развитие': '🧠',
    'Программирование': '💻'
  };
  
  return emojiMap[category] || '📺';
}

/**
 * Рассчитывает время до начала трансляции
 */
function calculateTimeLeft(startDatetime: string): string {
  const start = new Date(startDatetime);
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  
  if (diffMs <= 0) {
    return 'уже началась';
  }
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  
  if (diffHours > 0) {
    return `через ${diffHours}ч ${remainingMins}м`;
  } else if (diffMins === 15) {
    return 'через 15 минут';
  } else if (diffMins < 15) {
    return 'менее чем через 15 минут';
  } else {
    return `через ${diffMins} минут`;
  }
}
