import { Environment, TelegramUpdate } from './types';
import { parseSchedule } from './parser';
import { handleTelegramUpdate, sendNotification, sendArticleMessage } from './telegram';
import { queryAI, processArticleWithLLM } from './ai';
import { fetchAllRssItems } from './articles/fetcher';
import { filterNewArticles } from './articles/dedup';
import { pickTopArticles } from './articles/scorer';
import { saveProcessedArticle, getTopArticles, getUserTelegramIds } from './database';
import {
	clearOldBroadcasts,
	saveBroadcasts,
	getUpcomingBroadcasts,
	getBroadcastsForTomorrow,
	markNotificationSent,
} from './database';

export default {
	async fetch(request: Request, env: Environment, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Telegram Webhook
		if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
			return await handleTelegramWebhook(request, env);
		}

		// API: парсинг трансляций
		if (url.pathname === '/api/parse' && request.method === 'GET') {
			return await handleParseRequest(env);
		}

		// API: список трансляций
		if (url.pathname === '/api/broadcasts' && request.method === 'GET') {
			return await handleGetBroadcasts(env);
		}

		// API: запрос к AI (legacy)
		if (url.pathname === '/api/ai' && request.method === 'POST') {
			return await handleAIQuery(request, env);
		}

		// NEW: API: запуск дайджеста вручную
		if (url.pathname === '/api/digest' && request.method === 'POST') {
			return await handleDigestRequest(env);
		}

		// Status
		if (url.pathname === '/') {
			return new Response(JSON.stringify({
				status: 'ok',
				service: 'LiveClasses AI Agent v2.0',
				endpoints: [
					'GET / - статус',
					'POST /telegram-webhook - Telegram webhook',
					'GET /api/parse - парсинг расписания',
					'GET /api/broadcasts - список трансляций',
					'POST /api/ai - запрос к AI',
					'POST /api/digest - запуск дайджеста статей',
				]
			}), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		return new Response('Not Found', { status: 404 });
	},

	async scheduled(event: ScheduledEvent, env: Environment, ctx: ExecutionContext): Promise<void> {
		const cron = event.cron;

		// Ежедневный парсинг трансляций в 21:55 МСК (18:55 UTC) — LEGACY
		if (cron === '55 18 * * *') {
			await handleDailyParse(env);
		}

		// Проверка уведомлений каждые 5 минут — LEGACY
		if (cron === '*/5 * * * *') {
			await handleNotificationCheck(env);
		}

		// NEW: Ежедневный дайджест статей в 10:00 МСК (07:00 UTC)
		if (cron === '0 7 * * *') {
			await handleDailyDigest(env);
		}
	}
};

// ============================================================================
// HTTP Handlers
// ============================================================================

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

// ============================================================================
// NEW: Digest Handler (manual trigger)
// ============================================================================

async function handleDigestRequest(env: Environment): Promise<Response> {
	try {
		await handleDailyDigest(env);
		return new Response(JSON.stringify({
			success: true,
			message: 'Digest processing started'
		}), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Digest request error:', error);
		return new Response(JSON.stringify({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}

// ============================================================================
// Cron Handlers
// ============================================================================

async function handleDailyParse(env: Environment): Promise<void> {
	try {
		console.log('Starting daily parse at', new Date().toISOString());

		const broadcasts = await parseSchedule();
		await clearOldBroadcasts(env.DB);
		await saveBroadcasts(broadcasts, env.DB);

		console.log(`Daily parse completed. Saved ${broadcasts.length} broadcasts.`);

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

		const upcomingAll = await getUpcomingBroadcasts(env.DB, 15);
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

// ============================================================================
// NEW: Daily Digest Cron Handler
// ============================================================================

async function handleDailyDigest(env: Environment): Promise<void> {
	try {
		console.log('Starting daily digest at', new Date().toISOString());

		// 1. Получаем RSS
		const allItems = await fetchAllRssItems(48);
		console.log(`Fetched ${allItems.length} RSS items`);

		if (allItems.length === 0) {
			console.log('No RSS items found, skipping digest');
			return;
		}

		// 2. Фильтруем дубли
		const newItems = await filterNewArticles(allItems, env.DB);
		console.log(`${newItems.length} new articles after dedup`);

		if (newItems.length === 0) {
			console.log('No new articles to process');
			return;
		}

		// 3. Обрабатываем через LLM (лимит 1-2 статьи для экономии)
		const processedArticles = [];
		const limit = Math.min(newItems.length, 2);

		for (let i = 0; i < limit; i++) {
			const item = newItems[i];
			try {
				const processed = await processArticleWithLLM(item, env);
				if (processed) {
					await saveProcessedArticle(env.DB, processed);
					processedArticles.push(processed);
				}
			} catch (error) {
				console.error(`Failed to process article ${item.link}:`, error);
			}
		}

		console.log(`Processed ${processedArticles.length} articles through LLM`);

		// 4. Выбираем топ-N
		const topArticles = pickTopArticles(processedArticles, 5);

		if (topArticles.length === 0) {
			console.log('No articles passed scoring threshold');
			return;
		}

		// 5. Отправляем дайджест пользователям
		const dbUsers = await getUserTelegramIds(env.DB);
		const recipients = new Set<string>(dbUsers);
		if (env.ADMIN_TELEGRAM_ID) {
			recipients.add(env.ADMIN_TELEGRAM_ID);
		}

		for (const telegramId of recipients) {
			try {
				// Заголовок дайджеста
				await sendNotification(
					env.TELEGRAM_BOT_TOKEN,
					telegramId,
					`📰 *Утренний дайджест* (${new Date().toLocaleDateString('ru-RU')})\n\n` +
					`Найдено ${topArticles.length} лучших статей:`
				);

				// Каждая статья — отдельное сообщение
				for (const article of topArticles) {
					await sendArticleMessage(
						env.TELEGRAM_BOT_TOKEN,
						Number(telegramId),
						article
					);
				}
			} catch (error) {
				console.error(`Failed to send digest to ${telegramId}:`, error);
			}
		}

		console.log(`Daily digest completed. Sent ${topArticles.length} articles to ${recipients.size} users.`);
	} catch (error) {
		console.error('Daily digest failed:', error);

		if (env.ADMIN_TELEGRAM_ID) {
			await sendNotification(
				env.TELEGRAM_BOT_TOKEN,
				env.ADMIN_TELEGRAM_ID,
				`❌ Ошибка дайджеста: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}
}

// ============================================================================
// Utilities
// ============================================================================

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
