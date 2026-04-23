import { Environment, TelegramUpdate } from './types';
import { parseSchedule } from './parser';
import { handleTelegramUpdate, sendNotification } from './telegram';
import { queryAI } from './ai';
import { 
  clearOldBroadcasts, 
  saveBroadcasts, 
  getUpcomingBroadcasts, 
  getBroadcastsForTomorrow,
  markNotificationSent,
  getUserTelegramIds
} from './database';

export default {
  async fetch(request: Request, env: Environment, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Обработка Telegram Webhook
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      return await handleTelegramWebhook(request, env);
    }
    
    // API для тестирования
    if (url.pathname === '/api/parse' && request.method === 'GET') {
      return await handleParseRequest(env);
    }
    
    if (url.pathname === '/api/broadcasts' && request.method === 'GET') {
      return await handleGetBroadcasts(env);
    }
    
    if (url.pathname === '/api/ai' && request.method === 'POST') {
      return await handleAIQuery(request, env);
    }
    
    // Статус
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'LiveClasses AI Agent',
        endpoints: [
          'GET / - статус',
          'POST /telegram-webhook - Telegram webhook',
          'GET /api/parse - парсинг расписания',
          'GET /api/broadcasts - список трансляций',
          'POST /api/ai - запрос к AI'
        ]
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  },
  
  async scheduled(event: ScheduledEvent, env: Environment, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;
    
    // Ежедневный парсинг в 21:55 МСК (18:55 UTC)
    if (cron === '55 18 * * *') {
      await handleDailyParse(env);
    }
    
    // Проверка уведомлений каждые 5 минут
    if (cron === '*/5 * * * *') {
      await handleNotificationCheck(env);
    }
  }
};

// Обработчики
async function handleTelegramWebhook(request: Request, env: Environment): Promise<Response> {
  try {
    const update = await request.json() as TelegramUpdate;
    await handleTelegramUpdate(update, env);
    return new Response('OK');
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return new Response('Error', { status: 500 });
  }
}

async function handleParseRequest(env: Environment): Promise<Response> {
  try {
    const broadcasts = await parseSchedule();
    await clearOldBroadcasts(env.DB);
    await saveBroadcasts(broadcasts, env.DB);
    
    return new Response(JSON.stringify({
      success: true,
      count: broadcasts.length,
      broadcasts
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Parse error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleGetBroadcasts(env: Environment): Promise<Response> {
  try {
    const broadcasts = await getBroadcastsForTomorrow(env.DB);
    
    return new Response(JSON.stringify({
      success: true,
      count: broadcasts.length,
      broadcasts
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get broadcasts error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleAIQuery(request: Request, env: Environment): Promise<Response> {
  try {
    const body = await request.json() as { question?: unknown };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    
    if (!question) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Question is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const answer = await queryAI(question, env);
    
    return new Response(JSON.stringify({
      success: true,
      question,
      answer
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('AI query error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Обработчики cron задач
async function handleDailyParse(env: Environment): Promise<void> {
  try {
    console.log('Starting daily parse at', new Date().toISOString());
    
    const broadcasts = await parseSchedule();
    await clearOldBroadcasts(env.DB);
    await saveBroadcasts(broadcasts, env.DB);
    
    console.log(`Daily parse completed. Saved ${broadcasts.length} broadcasts.`);
    
    // Уведомление администратора
    if (env.ADMIN_TELEGRAM_ID) {
      await sendNotification(
        env.TELEGRAM_BOT_TOKEN,
        env.ADMIN_TELEGRAM_ID,
        `✅ Ежедневный парсинг завершен. Найдено ${broadcasts.length} трансляций на завтра.`
      );
    }
  } catch (error) {
    console.error('Daily parse failed:', error);
    
    if (env.ADMIN_TELEGRAM_ID) {
      await sendNotification(
        env.TELEGRAM_BOT_TOKEN,
        env.ADMIN_TELEGRAM_ID,
        `❌ Ошибка ежедневного парсинга: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

async function handleNotificationCheck(env: Environment): Promise<void> {
  try {
    console.log('Checking for notifications at', new Date().toISOString());
    
    const upcomingAll = await getUpcomingBroadcasts(env.DB, 15); // За 15 минут
    const upcoming = upcomingAll.filter(isAIBroadcast);
    const dbUsers = await getUserTelegramIds(env.DB);
    const recipients = new Set<string>(dbUsers);
    if (env.ADMIN_TELEGRAM_ID) {
      recipients.add(env.ADMIN_TELEGRAM_ID);
    }
    
    for (const broadcast of upcoming) {
      if (!broadcast.id) {
        console.warn(`Skipped broadcast without id: ${broadcast.title}`);
        continue;
      }

      let successCount = 0;
      for (const telegramId of recipients) {
        try {
          await sendNotification(
            env.TELEGRAM_BOT_TOKEN,
            telegramId,
            `🔔 Напоминание: Через 15 минут начнется трансляция!\n\n` +
            `📺 ${broadcast.title}\n` +
            `⏰ ${broadcast.start_time} (МСК)\n` +
            `👨‍🏫 ${broadcast.author}\n` +
            `🔗 ${broadcast.url}`
          );
          successCount++;
        } catch (error) {
          console.error(`Failed to send notification to ${telegramId}:`, error);
        }
      }

      if (successCount > 0) {
        await markNotificationSent(env.DB, broadcast.id);
        console.log(
          `Notification sent for broadcast: ${broadcast.title} (recipients: ${successCount})`
        );
      }
    }
    
    if (upcoming.length > 0) {
      console.log(`Sent notifications for ${upcoming.length} upcoming broadcasts.`);
    }
  } catch (error) {
    console.error('Notification check failed:', error);
  }
}

function isAIBroadcast(broadcast: { title: string; category?: string; url: string }): boolean {
  const haystack = `${broadcast.title} ${broadcast.category || ''} ${broadcast.url}`.toLowerCase();

  const aiKeywords = [
    ' ai ',
    'ai:',
    'ai-',
    'ai/',
    'chatgpt',
    'gpt',
    'нейросет',
    'нейросеть',
    'midjourney',
    'stable diffusion',
    'sdxl',
    'lora',
    'leonardo',
    'fooocus',
    'krea',
    'freepik',
    'prompt',
    'промпт',
  ];

  const paddedHaystack = ` ${haystack} `;
  return aiKeywords.some(keyword => paddedHaystack.includes(keyword));
}
