import {
	getAllBroadcasts,
	getBroadcastsForTomorrow,
	getNextBroadcast,
	searchBroadcasts,
} from './database';
import { Environment } from './types';

const MODEL = 'deepseek/deepseek-v3.2';

/**
 * Проверяет, что используется правильная модель
 * ОЧЕНЬ ВАЖНО: ТОЛЬКО deepseek/deepseek-v3.2
 */
function ensureCorrectModel(config: any): void {
	if (config.model !== MODEL) {
		throw new Error(
			`Только модель ${MODEL} разрешена. Получено: ${config.model}`,
		);
	}
}

/**
 * Запрашивает ответ у AI с использованием контекста из базы данных
 */
export async function queryAI(
	question: string,
	env: Environment,
): Promise<string> {
	try {
		// Проверяем модель из конфигурации
		ensureCorrectModel({ model: env.MODEL });

		// Получаем контекст из базы данных
		const context = await buildAIContext(question, env.DB);

		// Формируем промпт с контекстом
		const prompt = buildPrompt(question, context);

		// Отправляем запрос к AI
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

		// Дополнительная проверка модели в ответе
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

		// Fallback ответ на случай ошибки
		return await getFallbackAnswer(question, env.DB);
	}
}

/**
 * Строит контекст для AI на основе вопроса
 */
async function buildAIContext(
	question: string,
	db: D1Database,
): Promise<string> {
	const questionLower = question.toLowerCase();

	// Определяем тип вопроса
	if (
		questionLower.includes('ближайш') ||
		questionLower.includes('следующ') ||
		questionLower.includes('скоро') ||
		questionLower.includes('когда следующая')
	) {
		// Ближайшая трансляция
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
			.slice(0, 3); // Ближайшие 3

		return formatBroadcastsForContext(upcoming, 'Ближайшие трансляции:');
	} else if (
		questionLower.includes('завтра') ||
		questionLower.includes('расписан')
	) {
		// Расписание на завтра
		const broadcasts = await getBroadcastsForTomorrow(db);
		if (broadcasts.length === 0) {
			return 'На завтра трансляций не запланировано.';
		}

		return formatBroadcastsForContext(broadcasts, 'Расписание на завтра:');
	} else if (
		questionLower.includes('все') ||
		questionLower.includes('полное расписан')
	) {
		// Все трансляции
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
		// Вопросы об авторах
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
		// Вопросы по категориям/тематикам
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

		// Если поиск не дал результатов, показываем все категории
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
		// Количественные вопросы
		const broadcasts = await getAllBroadcasts(db);
		const tomorrowBroadcasts = await getBroadcastsForTomorrow(db);

		return (
			`Всего трансляций в базе: ${broadcasts.length}\n` +
			`Трансляций на завтра: ${tomorrowBroadcasts.length}`
		);
	} else {
		// Общий контекст
		const nextBroadcast = await getNextBroadcast(db);
		const tomorrowBroadcasts = await getBroadcastsForTomorrow(db);

		let context = '';

		if (nextBroadcast) {
			context += `Ближайшая трансляция: ${nextBroadcast.title} в ${nextBroadcast.start_time}, автор: ${nextBroadcast.author}\n`;
		}

		if (tomorrowBroadcasts.length > 0) {
			context += `На завтра запланировано ${tomorrowBroadcasts.length} трансляций.\n`;

			// Группируем по времени для краткости
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

/**
 * Форматирует трансляции для контекста AI
 */
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

/**
 * Извлекает поисковые термины из вопроса
 */
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

	// Проверяем категории
	for (const [category, keywords] of Object.entries(categoryMap)) {
		for (const keyword of keywords) {
			if (lowerQuestion.includes(keyword)) {
				terms.push(category);
				break;
			}
		}
	}

	// Если не нашли категорий, пытаемся извлечь ключевые слова
	if (terms.length === 0) {
		const words = question.split(/\s+/).filter(word => word.length > 3);
		terms.push(...words.slice(0, 2));
	}

	return terms;
}

/**
 * Строит промпт для AI
 */
function buildPrompt(question: string, context: string): string {
	return `Вопрос пользователя: "${question}"

Контекст (данные о трансляциях):
${context}

Пожалуйста, ответь на вопрос пользователя на основе предоставленного контекста.
Если в контексте нет информации для ответа, скажи об этом прямо.
Отвечай на русском языке кратко и информативно.`;
}

/**
 * Fallback ответ на случай ошибки AI
 */
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

/**
 * Тестовая функция для проверки использования правильной модели
 */
export function testModelValidation(): void {
	console.log('Testing model validation');
	ensureCorrectModel({ model: MODEL });
	console.log(`✓ Model ${MODEL} is allowed`);
}
