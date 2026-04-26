import {
	getRecentArticles,
	searchArticlesByTag,
	getRandomArticle,
} from './database';
import { Environment, RssItem, ProcessedArticle } from './types';
import { calculateTotalScore, getBaseScore } from './articles/scorer';
import { markArticleAsSeen } from './articles/dedup';
import { buildArticlesContext } from './agent/memory';

const MODEL = 'deepseek/deepseek-v3.2';

function ensureCorrectModel(config: { model: string }): void {
	if (config.model !== MODEL) {
		throw new Error(
			`Только модель ${MODEL} разрешована. Получено: ${config.model}`,
		);
	}
}

// ============================================================================
// Article processing with LLM
// ============================================================================

/**
 * Обрабатывает статью через LLM (deepseek/deepseek-v3.2)
 * Возвращает структурированный текст на русском языке
 */
export async function processArticleWithLLM(
	item: RssItem,
	env: Environment
): Promise<ProcessedArticle | null> {
	try {
		ensureCorrectModel({ model: env.MODEL });

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
						content: `Ты — опытный инженер и технический аналитик.
Разбери статью и объясни её простым и понятным языком на русском.
Отвечай СТРОГО по структуре, описанной в задании.`,
					},
					{ role: 'user', content: prompt },
				],
				temperature: 0.5,
				max_tokens: 2000,
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

		// Парсим текстовый ответ в структуру
		const parsed = parseArticleText(content);
		if (!parsed) {
			console.warn('Failed to parse LLM text for article:', item.title);
			return null;
		}

		const score = calculateTotalScore(
			item.source,
			parsed.relevance_score,
			parsed.depth_score
		);

		const seenId = await markArticleAsSeen(item, env.DB);

		return {
			seen_id: seenId,
			title: item.title,
			summary: parsed.summary,
			practical_value: parsed.practical_value,
			key_ideas: parsed.key_ideas,
			simple_explanation: parsed.simple_explanation,
			conclusion: parsed.conclusion,
			tags: parsed.tags,
			score,
			source_score: getBaseScore(item.source),
			relevance_score: parsed.relevance_score,
			depth_score: parsed.depth_score,
			url: item.link,
		};
	} catch (error) {
		console.error('processArticleWithLLM error:', error);
		return null;
	}
}

/**
 * Парсит текстовый ответ LLM в структуру
 * Ожидаемый формат:
 * 1. КРАТКОЕ РЕЗЮМЕ: ...
 * 2. ЧТО ЭТО ЗНАЧИТ НА ПРАКТИКЕ: ...
 * 3. КЛЮЧЕВЫЕ ИДЕИ: ...
 * 4. ОБЪЯСНЕНИЕ ПРОСТЫМ ЯЗЫКОМ: ...
 * 5. СТОИТ ЛИ ОБРАЩАТЬ ВНИМАНИЕ: ...
 * Теги: [tag1, tag2, ...]
 */
function parseArticleText(text: string): {
	summary: string;
	practical_value: string;
	key_ideas: string[];
	simple_explanation: string;
	conclusion: string;
	tags: string[];
	relevance_score: number;
	depth_score: number;
} | null {
	try {
		const lines = text.split('\n');
		let summary = '';
		let practical_value = '';
		let key_ideas: string[] = [];
		let simple_explanation = '';
		let conclusion = '';
		let tags: string[] = [];
		let relevance_score = 0;
		let depth_score = 0;

		let currentSection = '';
		let keyIdeasBlock = false;

		for (const line of lines) {
			const trimmed = line.trim();

			// Определяем секцию
			if (trimmed.startsWith('1.') || trimmed.toLowerCase().includes('краткое резюме')) {
				currentSection = 'summary';
				summary = extractSectionValue(trimmed, ['1.', 'краткое резюме', 'резюме']);
			} else if (trimmed.startsWith('2.') || trimmed.toLowerCase().includes('практик')) {
				currentSection = 'practical_value';
				practical_value = extractSectionValue(trimmed, ['2.', 'практик']);
			} else if (trimmed.startsWith('3.') || trimmed.toLowerCase().includes('ключевые идеи')) {
				currentSection = 'key_ideas';
				keyIdeasBlock = true;
				const value = extractSectionValue(trimmed, ['3.', 'ключевые идеи']);
				if (value) key_ideas.push(value);
			} else if (trimmed.startsWith('4.') || trimmed.toLowerCase().includes('объяснение простым')) {
				currentSection = 'simple_explanation';
				simple_explanation = extractSectionValue(trimmed, ['4.', 'объяснение простым']);
			} else if (trimmed.startsWith('5.') || trimmed.toLowerCase().includes('стоит ли обращать')) {
				currentSection = 'conclusion';
				conclusion = extractSectionValue(trimmed, ['5.', 'стоит ли обращать', 'внимание']);
			} else if (trimmed.toLowerCase().startsWith('теги:')) {
				tags = parseTags(trimmed);
			} else if (keyIdeasBlock && trimmed && !trimmed.startsWith('-') && !trimmed.match(/^\d+\./)) {
				// Продолжаем собирать ключевые идеи
				const cleanLine = trimmed.replace(/^[-\•]\s*/, '').trim();
				if (cleanLine && !cleanLine.toLowerCase().includes('ключевые идеи')) {
					key_ideas.push(cleanLine);
				}
			} else if (currentSection === 'summary' && trimmed && !trimmed.match(/^\d+\./)) {
				summary += ' ' + trimmed;
			} else if (currentSection === 'practical_value' && trimmed && !trimmed.match(/^\d+\./)) {
				practical_value += ' ' + trimmed;
			} else if (currentSection === 'simple_explanation' && trimmed && !trimmed.match(/^\d+\./)) {
				simple_explanation += ' ' + trimmed;
			} else if (currentSection === 'conclusion' && trimmed && !trimmed.match(/^\d+\./)) {
				conclusion += ' ' + trimmed;
			}
		}

		// Определяем оценки по качеству ответа
		if (summary.length > 50) relevance_score += 1;
		if (practical_value.length > 20) relevance_score += 1;
		if (key_ideas.length >= 3) depth_score = 1;
		else if (key_ideas.length >= 1) depth_score = 0.5;

		if (!summary || !conclusion) {
			console.warn('Missing required fields in parsed article');
			return null;
		}

		return {
			summary: summary.trim(),
			practical_value: practical_value.trim() || '',
			key_ideas: key_ideas.slice(0, 5),
			simple_explanation: simple_explanation.trim() || '',
			conclusion: conclusion.trim(),
			tags,
			relevance_score,
			depth_score,
		};
	} catch (error) {
		console.error('parseArticleText error:', error);
		return null;
	}
}

function extractSectionValue(line: string, prefixes: string[]): string {
	let value = line;
	for (const prefix of prefixes) {
		const idx = value.toLowerCase().indexOf(prefix.toLowerCase());
		if (idx !== -1) {
			value = value.substring(idx + prefix.length).trim();
			// Убираем "1.", "2." и т.д. в начале
			value = value.replace(/^\d+[\.\)]\s*/, '');
			break;
		}
	}
	return value;
}

function parseTags(line: string): string[] {
	const tagsPart = line.replace(/теги:\s*/i, '');
	const tagsMatch = tagsPart.match(/\[(.*?)\]/);
	if (tagsMatch) {
		return tagsMatch[1].split(',').map(t => t.trim().toLowerCase()).filter(t => t);
	}
	// Альтернативный формат: tag1, tag2, tag3
	return tagsPart.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
}

/**
 * Отвечает на вопрос пользователя по теме статей
 */
export async function queryArticlesByTopic(
	topic: string,
	env: Environment
): Promise<string> {
	try {
		const articles = await searchArticlesByTag(env.DB, topic, 14);

		if (articles.length > 0) {
			return formatArticleResponse(articles, topic);
		}

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
	return `РОЛЬ: Ты — опытный инженер и технический аналитик.
ЗАДАЧА: Разобрать статью и объяснить её простым и понятным языком на русском.

ТРЕБОВАНИЯ К ОТВЕТУ:
1. КРАТКОЕ РЕЗЮМЕ (2–3 предложения)
— суть статьи без воды
2. ЧТО ЭТО ЗНАЧИТ НА ПРАКТИКЕ
— зачем это нужно разработчику
— где это применяется
3. КЛЮЧЕВЫЕ ИДЕИ
— 3–5 пунктов
4. ОБЪЯСНЕНИЕ ПРОСТЫМ ЯЗЫКОМ
— как будто объясняешь разработчику уровня junior
5. СТОИТ ЛИ ОБРАЩАТЬ ВНИМАНИЕ
— да / нет + короткое объяснение

Теги: [ai, agents, llm, infra, vibe-coding, devops]

СТИЛЬ:
• без воды
• без маркетинга
• максимально понятно
• конкретно

ВХОД:
${articleContent.slice(0, 3000)}

ВЫХОД: структурированный текст на русском языке по секциям 1-5`;
}
