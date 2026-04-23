import { load } from 'cheerio';
import { ParserResult } from './types';

/**
 * Парсит страницу расписания liveclasses.ru и извлекает трансляции на завтра
 */
export async function parseSchedule(): Promise<ParserResult[]> {
  try {
    const response = await fetch('https://liveclasses.ru/schedule/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LiveClassesParser/1.0; +https://github.com/liveclasses-agent)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    return parseHTML(html);
  } catch (error) {
    console.error('Failed to parse schedule:', error);
    throw new Error(`Failed to parse schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Парсит HTML и извлекает трансляции на завтра
 */
function parseHTML(html: string): ParserResult[] {
  const $ = load(html);
  const wrapper = findTomorrowWrapper($);
  if (!wrapper) {
    console.warn('Could not find tomorrow section in HTML');
    return [];
  }

  const results: ParserResult[] = [];
  wrapper.find('.product').each((_, el) => {
    const parsed = parseProduct($, $(el));
    if (parsed) {
      results.push(parsed);
    }
  });

  return results;
}

/**
 * Очищает текст от HTML тегов
 */
function cleanText(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findTomorrowWrapper($: ReturnType<typeof load>) {
  const headers = $('.schedule__header');
  for (const headerEl of headers.toArray()) {
    const header = $(headerEl);
    const subtitle = cleanText(header.find('.schedule__subtitle').text());
    if (subtitle.includes('Завтра')) {
      const wrapper = header.nextAll('.product-list__wrapper').first();
      if (wrapper.length > 0) {
        return wrapper;
      }
    }
  }
  return null;
}

function parseProduct(
  $: ReturnType<typeof load>,
  product: ReturnType<ReturnType<typeof load>>
): ParserResult | null {
  const title = cleanText(product.find('.product__name').first().text());
  if (!title) {
    return null;
  }

  const author =
    cleanText(product.find('.product__author').first().text()) || 'Неизвестный автор';
  const href = product.find('a.workshop__link').first().attr('href');
  const url = href
    ? (href.startsWith('http') ? href : `https://liveclasses.ru${href}`)
    : 'https://liveclasses.ru/schedule/';

  const statusText = cleanText(product.find('.product__status').first().text());
  const timeMatch = statusText.match(/(\d{1,2}:\d{2})/);
  const start_time = timeMatch ? timeMatch[1] : '00:00';

  let category: string | undefined;
  const categoryMatch = url.match(/\/course\/([^/]+)\//);
  if (categoryMatch) {
    const categoryMap: Record<string, string> = {
      graphics: 'Графика и дизайн',
      video_and_audio: 'Видео и звук',
      photo: 'Фотография',
      art: 'Искусство',
      soft_skills: 'Общее развитие',
      programming: 'Программирование',
    };
    category = categoryMap[categoryMatch[1]] || categoryMatch[1];
  }

  return {
    title,
    start_time,
    author,
    url,
    category,
  };
}

/**
 * Тестовая функция для проверки парсера на предоставленном HTML
 */
export function testParser(html: string): ParserResult[] {
  return parseHTML(html);
}
