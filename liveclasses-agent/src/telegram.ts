import { TelegramUpdate, Environment, ProcessedArticle } from './types';
import { upsertUser, getTopArticles } from './database';
import { queryArticlesByTopic } from './ai';
import { decideResponse, shouldSearchArticles } from './agent/decision';
import { saveUserQuery } from './agent/memory';
import { understandQuery } from './agent/understanding';

const TELEGRAM_API_URL = 'https://api.telegram.org/bot';

// ============================================================================
// Main handler
// ============================================================================

export async function handleTelegramUpdate(update: TelegramUpdate, env: Environment): Promise<void> {
	try {
		if (!update.message || !update.message.text) {
			return;
		}

		const chatId = update.message.chat.id;
		const text = update.message.text.trim();
		const username = update.message.from.username || update.message.from.first_name;
		const telegramId = String(chatId);

		console.log(`Received message from ${username}: ${text}`);

		await upsertUser(env.DB, telegramId, username);

		if (text.startsWith('/')) {
			await handleCommand(text, chatId, env, telegramId);
		} else {
			await handleTextMessage(text, chatId, env, username, telegramId);
		}
	} catch (error) {
		console.error('Error handling Telegram update:', error);
	}
}

// ============================================================================
// Commands
// ============================================================================

async function handleCommand(
	command: string,
	chatId: number,
	env: Environment,
	telegramId: string
): Promise<void> {
	const cmd = command.split(' ')[0].toLowerCase();

	switch (cmd) {
		case '/start':
			await sendMessage(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				`👋 Привет! Я AI-агент для технологических новостей.\n\n` +
				`📋 Доступные команды:\n` +
				`/start — это сообщение\n` +
				`/help — справка\n` +
				`/digest — последний дайджест статей\n\n` +
				`💬 Задавай вопросы:\n` +
				`• "что нового по AI?"\n` +
				`• "что есть по агентам?"\n` +
				`• "новости по vibe coding"`
			);
			break;

		case '/help':
			await sendMessage(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				`🤖 *Помощь*\n\n` +
				`📋 *Команды:*\n` +
				`/start — начать работу\n` +
				`/digest — дайджест статей\n\n` +
				`💬 *Примеры вопросов:*\n` +
				`• Что нового по AI?\n` +
				`• Новости по vibe coding\n` +
				`• Какие статьи по агентам?\n\n` +
				`📰 *Дайджест:*\n` +
				`Публикуется ежедневно в 10:00 МСК.`
			);
			break;

		case '/digest':
			await handleDigestCommand(chatId, env);
			break;

		default:
			await sendMessage(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				`❌ Неизвестная команда. Используйте /help для списка команд.`
			);
	}
}

// ============================================================================
// Article digest handler
// ============================================================================

async function handleDigestCommand(chatId: number, env: Environment): Promise<void> {
	try {
		const articles = await getTopArticles(env.DB, 5, 7);

		if (articles.length === 0) {
			await sendMessage(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				`📭 Дайджест пока не сформирован.\n` +
				`Дайджест публикуется ежедневно в 10:00. Попробуйте позже.`
			);
			return;
		}

		await sendMessage(
			env.TELEGRAM_BOT_TOKEN,
			chatId,
			`📰 *Утренний дайджест* (${new Date().toLocaleDateString('ru-RU')})\n\n` +
			`Найдено ${articles.length} лучших статей:`
		);

		for (const article of articles) {
			await sendArticleMessage(env.TELEGRAM_BOT_TOKEN, chatId, article);
		}
	} catch (error) {
		console.error('Error handling digest command:', error);
		await sendMessage(
			env.TELEGRAM_BOT_TOKEN,
			chatId,
			'❌ Ошибка при получении дайджеста. Попробуйте позже.'
		);
	}
}

/**
 * Отправляет одну статью в Telegram (отдельное сообщение)
 */
export async function sendArticleMessage(
	token: string,
	chatId: number,
	article: ProcessedArticle
): Promise<void> {
	const lines: string[] = [];
	lines.push(`📄 *${article.title}*`);
	lines.push(`🏷️ ${article.tags.join(' • ')}`);
	lines.push(`⭐ Скор: ${article.score}/10`);
	lines.push('');
	lines.push(`📝 ${article.summary}`);
	if (article.practical_value) {
		lines.push(`💡 ${article.practical_value}`);
	}
	if (article.key_ideas && article.key_ideas.length > 0) {
		lines.push('');
		lines.push('*Ключевые идеи:*');
		article.key_ideas.forEach((idea, i) => {
			lines.push(`${i + 1}. ${idea}`);
		});
	}
	lines.push('');
	lines.push(`🔗 [Читать статью](${article.url})`);

	const text = lines.join('\n');
	await sendMessage(token, chatId, text);
}

// ============================================================================
// Text messages — Agent-first routing for articles
// ============================================================================

async function handleTextMessage(
	text: string,
	chatId: number,
	env: Environment,
	username: string,
	telegramId: string
): Promise<void> {
	try {
		// Agent Decision Layer: определяем тип запроса
		const decision = await decideResponse(text, env);
		await saveUserQuery(env.DB, text, decision.topic, decision.responseType, telegramId);

		// Все запросы теперь обрабатываем через статьи
		if (shouldSearchArticles(decision)) {
			await sendMessage(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				`🔍 Ищу по теме "${decision.topic}"...`
			);

			const answer = await queryArticlesByTopic(decision.topic, env);
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, answer);
		} else {
			// Для общих запросов — поиск по всем статьям
			const answer = await queryArticlesByTopic(decision.topic || text, env);
			await sendMessage(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				`🤖 ${answer}`
			);
		}
	} catch (error) {
		console.error('Error handling text message:', error);
		await sendMessage(
			env.TELEGRAM_BOT_TOKEN,
			chatId,
			'❌ Ошибка при обработке сообщения. Попробуйте позже.'
		);
	}
}

// ============================================================================
// Telegram API helpers
// ============================================================================

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
