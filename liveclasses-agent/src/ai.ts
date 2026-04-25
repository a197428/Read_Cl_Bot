import {
	getAllBroadcasts,
	getBroadcastsForTomorrow,
	getNextBroadcast,
	searchBroadcasts,
	getRecentArticles,
	searchArticlesByTag,
} from './database';
import { Environment, RssItem, ArticleLLMResult, ProcessedArticle } from './types';
import { calculateTotalScore } from './articles/scorer';
import { markArticleAsSeen } from './articles/dedup';
import { buildArticlesContext } from './agent/memory';

const MODEL = 'deepseek/deepseek-v3.2';

function ensureCorrectModel(config: any): void {
	if (config.model !== MODEL) {
		throw new Error(
			`Только модель ${MODEL} разрешена. Получено: ${config.model}`,
		);
	}
}

// ============================================================================
// Legacy: queryAI для трансляций
// ============================================================================

export async function queryAI(
	question: string,
	env: Environment,
): Promise<string> {
	try {
		ensureCorrectModel({ model: env.MODEL });

		const context = await buildAIContext(question, env.DB);
		const prompt = buildPrompt(question, context);

		const response = await fetch(`${env.ROUTERAI_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
			},
			body: JSON.stringify({
				model: env.MODEL,
				messages: [
					{
						role: 'system',
						content: `Ты - AI ассистент для трансляций LiveClasses. 
Ты отвечаешь на вопросы о предстоящих трансляциях на основе данных из базы.
Отвечай на русском языке кратко, ясно и информативно.
Если информации недостаточно, скажи об этом прямо.
Используй только предоставленный контекст для ответов.`,
					},
					{
						role: 'user',
						content: prompt,
					},
				],
				temperature: 0.7,
				max_tokens: 1000,
				stream: false,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('AI API error:', response.status, errorText);
			throw new Error(`AI API error: ${response.status}`);
		}

		const data = (await response.json()) as any;

		if (data.model && data.model !== env.MODEL) {
			console.warn(
				`Warning: AI response mentions different model: ${data.model}`,
			);
		}

		return (
			data.choices?.[0]?.message?.content ||
			'Извините, не удалось получить ответ.'
		);
	} catch (error) {
		console.error('AI query error:', error);
		return await getFallbackAnswer(question, env.DB);
	}
}

async function buildAIContext(
	question: string,
	db: D1Database,
): Promise<string> {
	const questionLower = question.toLowerCase();

	if (
		questionLower.includes('ближайш') ||
		questionLower.includes('следующ') ||
		questionLower.includes('скоро') ||
		questionLower.includes('когда следующая')
	) {
		const nextBroadcast = await getNextBroadcast(db);
		if (!nextBroadcast) {
			return 'Ближайших трансляций не найдено.';
		}

		const broadcasts = await getAllBroadcasts(db);
		const upcoming = broadcasts
			.filter(b => {
				const start = new Date(b.start_datetime);
				return start > new Date();
			})
			.slice(0, 3);

		return formatBroadcastsForContext(upcoming, 'Ближайшие трансляции:');
	} else if (
		questionLower.includes('завтра') ||
		questionLower.includes('расписан')
	) {
		const broadcasts = await getBroadcastsForTomorrow(db);
		if (broadcasts.length === 0) {
			return 'На завтра трансляций не запланировано.';
		}

		return formatBroadcastsForContext(broadcasts, 'Расписание на завтра:');
	} else if (
		questionLower.includes('все') ||
		questionLower.includes('полное расписан')
	) {
		const broadcasts = await getAllBroadcasts(db);
		if (broadcasts.length === 0) {
			return 'Трансляций не найдено.';
		}

		return formatBroadcastsForContext(broadcasts.slice(0, 10), 'Трансляции:');
	} else if (
		questionLower.includes('кто') ||
		questionLower.includes('автор') ||
		questionLower.includes('преподаватель') ||
		questionLower.includes('лектор')
	) {
		const broadcasts = await getAllBroadcasts(db);
		const authors = [...new Set(broadcasts.map(b => b.author))];

		let context = 'Авторы/преподаватели трансляций:\n';
		for (const author of authors.slice(0, 10)) {
			const authorBroadcasts = broadcasts.filter(b => b.author === author);
			context += `• ${author} (${authorBroadcasts.length} трансляций)\n`;
		}

		return context;
	} else if (
		questionLower.includes('категори') ||
		questionLower.includes('тематик') ||
		questionLower.includes('дизайн') ||
		questionLower.includes('фото') ||
		questionLower.includes('видео') ||
		questionLower.includes('искусство') ||
		questionLower.includes('программирование') ||
		questionLower.includes('развитие')
	) {
		const searchTerms = extractSearchTerms(question);
		if (searchTerms.length > 0) {
			const results: string[] = [];

			for (const term of searchTerms) {
				const broadcasts = await searchBroadcasts(db, term);
				if (broadcasts.length > 0) {
					results.push(
						...formatBroadcastsForContext(
							broadcasts.slice(0, 5),
							`По запросу "${term}":`,
						).split('\n'),
					);
				}
			}

			if (results.length > 0) {
				return results.join('\n');
			}
		}

		const broadcasts = await getAllBroadcasts(db);
		const categories = [
			...new Set(broadcasts.map(b => b.category).filter(Boolean)),
		];

		let context = 'Категории трансляций:\n';
		for (const category of categories) {
			const categoryBroadcasts = broadcasts.filter(
				b => b.category === category,
			);
			context += `• ${category} (${categoryBroadcasts.length} трансляций)\n`;
		}

		return context;
	} else if (
		questionLower.includes('сколько') ||
		questionLower.includes('количеств')
	) {
		const broadcasts = await getAllBroadcasts(db);
		const tomorrowBroadcasts = await getBroadcastsForTomorrow(db);

		return (
			`Всего трансляций в базе: ${broadcasts.length}\n` +
			`Трансляций на завтра: ${tomorrowBroadcasts.length}`
		);
	} else {
		const nextBroadcast = await getNextBroadcast(db);
		const tomorrowBroadcasts = await getBroadcastsForTomorrow(db);

		let context = '';

		if (nextBroadcast) {
			context += `Ближайшая трансляция: ${nextBroadcast.title} в ${nextBroadcast.start_time}, автор: ${nextBroadcast.author}\n`;
		}

		if (tomorrowBroadcasts.length > 0) {
			context += `На завтра запланировано ${tomorrowBroadcasts.length} трансляций.\n`;

			const timeGroups: Record<string, number> = {};
			tomorrowBroadcasts.forEach(b => {
				timeGroups[b.start_time] = (timeGroups[b.start_time] || 0) + 1;
			});

			const times = Object.keys(timeGroups).sort();
			if (times.length > 0) {
				context +=
					'Основные время начала: ' + times.slice(0, 3).join(', ') + '\n';
			}
		}

		return context || 'Данные о трансляциях отсутствуют.';
	}
}

function formatBroadcastsForContext(broadcasts: any[], title: string): string {
	if (broadcasts.length === 0) {
		return `${title} Нет данных.`;
	}

	let context = `${title}\n\n`;

	for (const broadcast of broadcasts) {
		context += `• ${broadcast.start_time} - ${broadcast.title}\n`;
		context += `  Автор: ${broadcast.author}\n`;
		if (broadcast.category) {
			context += `  Категория: ${broadcast.category}\n`;
		}
		context += `  Ссылка: ${broadcast.url}\n\n`;
	}

	return context.trim();
}

function extractSearchTerms(question: string): string[] {
	const terms: string[] = [];
	const lowerQuestion = question.toLowerCase();

	const categoryMap: Record<string, string[]> = {
		дизайн: ['дизайн', 'график', 'photoshop', 'illustrator'],
		фото: ['фото', 'фотограф', 'камер', 'съемк'],
		видео: ['видео', 'монтаж', 'съемк', 'редакт'],
		искусство: ['искусство', 'арт', 'живопис', 'рисован'],
		программирование: ['программирование', 'код', 'разработк', 'алгоритм'],
		развитие: ['развитие', 'навык', 'обучен', 'образован'],
	};

	for (const [category, keywords] of Object.entries(categoryMap)) {
		for (const keyword of keywords) {
			if (lowerQuestion.includes(keyword)) {
				terms.push(category);
				break;
			}
		}
	}

	if (terms.length === 0) {
		const words = question.split(/\s+/).filter(word => word.length > 3);
		terms.push(...words.slice(0, 2));
	}

	return terms;
}

function buildPrompt(question: string, context: string): string {
	return `Вопрос пользователя: "${question}"

Контекст (данные о трансляциях):
${context}

Пожалуйста, ответь на вопрос пользователя на основе предоставленного контекста.
Если в контексте нет информации для ответа, скажи об этом прямо.
Отвечай на русском языке кратко и информативно.`;
}

async function getFallbackAnswer(
	question: string,
	db: D1Database,
): Promise<string> {
	const questionLower = question.toLowerCase();

	try {
		if (
			questionLower.includes('ближайш') ||
			questionLower.includes('следующ')
		) {
			const nextBroadcast = await getNextBroadcast(db);
			if (nextBroadcast) {
				return `Ближайшая трансляция: "${nextBroadcast.title}" в ${nextBroadcast.start_time}. Автор: ${nextBroadcast.author}.`;
			}
			return 'Ближайших трансляций не найдено.';
		} else if (
			questionLower.includes('завтра') ||
			questionLower.includes('расписан')
		) {
			const broadcasts = await getBroadcastsForTomorrow(db);
			if (broadcasts.length === 0) {
				return 'На завтра трансляций не запланировано.';
			}
			return `На завтра запланировано ${broadcasts.length} трансляций. Используйте /schedule для подробного расписания.`;
		} else if (questionLower === 'тест') {
			return 'Тестовое напоминание: скоро начнется трансляция! Используйте команду /next для ближайшей трансляции.';
		} else {
			return (
				'Извините, в данный момент сервис AI недоступен. Попробуйте использовать команды:\n' +
				'/schedule - расписание на завтра\n' +
				'/next - ближайшая трансляция\n' +
				'/search [запрос] - поиск трансляций'
			);
		}
	} catch (error) {
		console.error('Fallback answer error:', error);
		return 'Извините, произошла ошибка. Попробуйте позже или используйте команды бота.';
	}
}

export function testModelValidation(): void {
	console.log('Testing model validation');
	ensureCorrectModel({ model: MODEL });
	console.log(`✓ Model ${MODEL} is allowed`);
}

// ============================================================================
// NEW: Article processing with LLM
// ============================================================================

/**
 * Обрабатывает статью через LLM (deepseek/deepseek-v3.2)
 */
export async function processArticleWithLLM(
	item: RssItem,
	env: Environment
): Promise<ProcessedArticle | null> {
	try {
		ensureCorrectModel({ model: env.MODEL });

		// Получаем контент статьи (опционально — для глубокого анализа)
		// Для экономии токенов отправляем только заголовок + описание
		const articleContent = `${item.title}\n\n${item.description || ''}`;

		const prompt = buildArticleProcessingPrompt(articleContent);

		const response = await fetch(`${env.ROUTERAI_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
			},
			body: JSON.stringify({
				model: env.MODEL,
				messages: [
					{
						role: 'system',
						content: `Ты — инженер и аналитик. Разбери статью и подготовь данные для AI-системы.
Отвечай ТОЛЬКО валидным JSON без markdown-разметки.`,
					},
					{ role: 'user', content: prompt },
				],
				temperature: 0.5,
				max_tokens: 1500,
				stream: false,
			}),
		});

		if (!response.ok) {
			console.error('LLM article processing error:', response.status);
			return null;
		}

		const data = (await response.json()) as any;
		const content = data.choices?.[0]?.message?.content;

		if (!content) {
			console.warn('Empty LLM response for article:', item.title);
			return null;
		}

		// Парсим JSON из ответа
		const result = parseLLMJson<ArticleLLMResult>(content);
		if (!result) {
			console.warn('Failed to parse LLM JSON for article:', item.title);
			return null;
		}

		// Считаем итоговый скор
		const score = calculateTotalScore(
			item.source,
			result.relevance_score,
			result.depth_score
		);

		// Сохраняем в articles_seen и получаем seen_id
		const seenId = await markArticleAsSeen(item, env.DB);

		return {
			seen_id: seenId,
			title: item.title,
			summary: result.summary,
			practical_value: result.practical_value,
			key_ideas: result.key_ideas,
			simple_explanation: result.simple_explanation,
			conclusion: result.conclusion,
			tags: result.tags.map(t => t.toLowerCase()),
			score,
			source_score: getBaseScoreForSource(item.source),
			relevance_score: result.relevance_score,
			depth_score: result.depth_score,
			url: item.link,
		};
	} catch (error) {
		console.error('processArticleWithLLM error:', error);
		return null;
	}
}

/**
 * Отвечает на вопрос пользователя по теме статей
 */
export async function queryArticlesByTopic(
	topic: string,
	env: Environment
): Promise<string> {
	try {
		// 1. Ищем статьи по тегам (14 дней)
		const articles = await searchArticlesByTag(env.DB, topic, 14);

		// 2. Если нашли — формируем ответ из БД
		if (articles.length > 0) {
			return formatArticleResponse(articles, topic);
		}

		// 3. Fallback: ищем по всем недавним статьям через LLM
		const recentArticles = await getRecentArticles(env.DB, 14);
		if (recentArticles.length === 0) {
			return `По теме "${topic}" пока нет данных. Дайджест публикуется ежедневно в 10:00.`;
		}

		const context = buildArticlesContext(recentArticles);
		const answer = await askLLMForTopicAnalysis(topic, context, env);
		return answer;
	} catch (error) {
		console.error('queryArticlesByTopic error:', error);
		return `Ошибка при поиске по теме "${topic}". Попробуйте позже.`;
	}
}

/**
 * Формирует ответ из найденных статей
 */
function formatArticleResponse(articles: ProcessedArticle[], topic: string): string {
	const lines: string[] = [`📚 Что нового по теме "${topic}":\n`];

	for (const a of articles.slice(0, 5)) {
		lines.push(`📄 *${a.title}*`);
		lines.push(`🏷️ ${a.tags.join(' • ')}`);
		lines.push(`📝 ${a.summary}`);
		if (a.practical_value) {
			lines.push(`💡 ${a.practical_value}`);
		}
		lines.push(`🔗 [Читать](${a.url})`);
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Запрашивает у LLM анализ по теме на основе накопленных статей
 */
async function askLLMForTopicAnalysis(
	topic: string,
	context: string,
	env: Environment
): Promise<string> {
	try {
		ensureCorrectModel({ model: env.MODEL });

		const response = await fetch(`${env.ROUTERAI_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
			},
			body: JSON.stringify({
				model: env.MODEL,
				messages: [
					{
						role: 'system',
						content: `Ты — AI аналитик технологических трендов. 
На основе предоставленных статей дай краткий обзор по теме.
Отвечай на русском языке, конкретно, без воды.`,
					},
					{
						role: 'user',
						content: `Тема: "${topic}"

Контекст (статьи из базы):
${context}

Дай краткий обзор трендов по этой теме на основе статей.
Если данных недостаточно — скажи прямо.`,
					},
				],
				temperature: 0.7,
				max_tokens: 1200,
				stream: false,
			}),
		});

		if (!response.ok) {
			return `По теме "${topic}" нет свежих данных, но вы можете посмотреть последний дайджест командой /digest.`;
		}

		const data = (await response.json()) as any;
		return (
			data.choices?.[0]?.message?.content ||
			`По теме "${topic}" пока нет данных.`
		);
	} catch (error) {
		console.error('askLLMForTopicAnalysis error:', error);
		return `Не удалось получить анализ по теме "${topic}".`;
	}
}

// ============================================================================
// Prompt builders
// ============================================================================

function buildArticleProcessingPrompt(articleContent: string): string {
	return `РОЛЬ: Ты — инженер и аналитик.
ЗАДАЧА: Разобрать статью и подготовить данные для AI-системы.

СТИЛЬ: конкретно, без воды, понятно.

СТАТЬЯ:
${articleContent.slice(0, 3000)}

ТРЕБОВАНИЯ (ответ в JSON):
{
  "summary": "КРАТКОЕ РЕЗЮМЕ (2-3 предложения)",
  "practical_value": "ПРАКТИЧЕСКАЯ ЦЕННОСТЬ (1 предложение)",
  "key_ideas": ["КЛЮЧЕВАЯ ИДЕЯ 1", "КЛЮЧЕВАЯ ИДЕЯ 2", "КЛЮЧЕВАЯ ИДЕЯ 3"],
  "simple_explanation": "ПРОСТОЕ ОБЪЯСНЕНИЕ для не-эксперта",
  "conclusion": "ВЫВОД: стоит ли читать и почему",
  "tags": ["ai", "agents", "llm", "infra", "vibe-coding", "devops"],
  "relevance_score": 0,
  "depth_score": 0
}

relevance_score: 0-2 (0=не релевантно, 1=частично, 2=высокая релевантность для разработчиков)
depth_score: 0-1 (0=поверхностно, 1=глубокий анализ)`;
}

// ============================================================================
// Helpers
// ============================================================================

function getBaseScoreForSource(source: string): number {
	const scores: Record<string, number> = {
		thenewstack: 3,
		infoworld: 3,
		tds: 2,
	};
	return scores[source] || 0;
}

/**
 * Парсит JSON из LLM-ответа (с защитой от markdown-обёртки)
 */
function parseLLMJson<T>(content: string): T | null {
	try {
		// Убираем markdown-обёртку ```json ... ```
		const cleaned = content
			.replace(/^```json\s*/, '')
			.replace(/^```\s*/, '')
			.replace(/\s*```$/, '')
			.trim();

		return JSON.parse(cleaned) as T;
	} catch {
		return null;
	}
}
