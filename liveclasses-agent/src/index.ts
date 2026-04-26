import { Environment, TelegramUpdate } from './types';
import { handleTelegramUpdate, sendNotification, sendArticleMessage } from './telegram';
import { processArticleWithLLM } from './ai';
import { fetchAllRssItems } from './articles/fetcher';
import { filterNewArticles } from './articles/dedup';
import { pickTopArticles } from './articles/scorer';
import { saveProcessedArticle, getUserTelegramIds } from './database';

export default {
	async fetch(request: Request, env: Environment, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Telegram Webhook
		if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
			return await handleTelegramWebhook(request, env);
		}

		// API: запуск дайджеста вручную
		if (url.pathname === '/api/digest' && request.method === 'POST') {
			return await handleDigestRequest(env);
		}

		// Status
		if (url.pathname === '/') {
			return new Response(JSON.stringify({
				status: 'ok',
				service: 'Article Digest Agent',
				description: 'Ежедневный дайджест технологических статей в 10:00 МСК',
				endpoints: [
					'GET / - статус',
					'POST /telegram-webhook - Telegram webhook',
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

		// Ежедневный дайджест статей в 10:00 МСК (07:00 UTC)
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
// Daily Digest Cron Handler
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
