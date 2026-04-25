/**
 * RSS Fetcher для AI-агента
 * Источники: The New Stack, InfoWorld, Towards Data Science
 * Использует @xmldom/xmldom вместо DOMParser (недоступен в Cloudflare Workers)
 */

import { DOMParser } from '@xmldom/xmldom';
import { RssItem, ArticleSource, RssSourceConfig } from '../types';

const RSS_SOURCES: RssSourceConfig[] = [
  { name: 'thenewstack', url: 'https://thenewstack.io/feed/', baseScore: 3 },
  { name: 'infoworld', url: 'https://www.infoworld.com/feed/', baseScore: 3 },
  { name: 'tds', url: 'https://towardsdatascience.com/feed/', baseScore: 2 },
];

/**
 * Получает все RSS-элементы из настроенных источников
 * Фильтрует статьи за последние hoursBack часов
 */
export async function fetchAllRssItems(hoursBack: number = 24): Promise<RssItem[]> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const allItems: RssItem[] = [];

  for (const source of RSS_SOURCES) {
    try {
      const items = await fetchRssSource(source, cutoff);
      allItems.push(...items);
    } catch (error) {
      console.error(`RSS fetch failed for ${source.name}:`, error);
    }
  }

  allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  return allItems;
}

async function fetchRssSource(source: RssSourceConfig, cutoff: Date): Promise<RssItem[]> {
  const response = await fetch(source.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (LiveClasses-AI-Agent/2.0)',
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${source.url}`);
  }

  const xml = await response.text();
  return parseRssXml(xml, source.name, cutoff);
}

function parseRssXml(xml: string, source: ArticleSource, cutoff: Date): RssItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const items = doc.getElementsByTagName('item');
  const results: RssItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const title = getTagText(item, 'title');
    const link = getTagText(item, 'link');
    const pubDateStr = getTagText(item, 'pubDate');
    const description = getTagText(item, 'description');

    if (!title || !link || !pubDateStr) continue;

    const pubDate = new Date(pubDateStr);
    if (isNaN(pubDate.getTime())) continue;
    if (pubDate < cutoff) continue;

    results.push({
      title: cleanText(title),
      link: cleanText(link),
      pubDate: pubDate.toISOString(),
      description: description ? cleanText(description) : undefined,
      source,
    });
  }

  return results;
}

function getTagText(parent: any, tagName: string): string | undefined {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.textContent || undefined;
}

function cleanText(text: string): string {
  return text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getRssSourceConfigs(): RssSourceConfig[] {
  return [...RSS_SOURCES];
}
