import {
	getRecentArticles,
	searchArticlesByTag,
} from './database';
import { Environment, RssItem, ArticleLLMResult, ProcessedArticle } from './types';
import { calculateTotalScore } from './articles/scorer';
import { markArticleAsSeen } from './articles/dedup';
import { buildArticlesContext } from './agent/memory';

const MODEL = 'deepseek/deepseek-v3.2';

function ensureCorrectModel(config: { model: string }): void {
	if (config.model !== MODEL) {
		throw new Error(
			`Только модель ${MODEL} разрешена. Получено: ${config.model}`,
		);
	}
}

// ============================================================================
// Article processing with LLM
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

		const result = parseLLMJson<ArticleLLMResult>(content);
		if (!result) {
			console.warn('Failed to parse LLM JSON for article:', item.title);
			return null;
		}

		const score = calculateTotalScore(
			item.source,
			result.relevance_score,
			result.depth_score
		);

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
