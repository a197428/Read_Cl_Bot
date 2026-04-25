import { describe, it, expect, vi, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { fetchAllRssItems } from './fetcher';

// Мок DOMParser для Node.js окружения через jsdom
class MockDOMParser {
  parseFromString(xml: string, mimeType: string): Document {
    const dom = new JSDOM(xml, { contentType: mimeType });
    return dom.window.document;
  }
}

describe('fetchAllRssItems', () => {
  beforeAll(() => {
    // @ts-ignore
    global.DOMParser = MockDOMParser;
  });

  it('should return empty array when RSS has no items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<rss><channel></channel></rss>', { status: 200 })
    );
    global.fetch = fetchMock;

    const items = await fetchAllRssItems(24);
    expect(items).toEqual([]);
  });

  it('should parse RSS items correctly', async () => {
    const pubDate = new Date().toUTCString();
    const rssXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Test Article</title>
      <link>https://example.com/article</link>
      <pubDate>${pubDate}</pubDate>
      <description>Test description</description>
    </item>
  </channel>
</rss>`;

    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(new Response(rssXml, { status: 200 }));
    });
    global.fetch = fetchMock;

    const items = await fetchAllRssItems(24);

    // Должно быть хотя бы 3 вызова (по одному на источник)
    expect(callCount).toBeGreaterThanOrEqual(3);
    // Каждый источник вернул 1 item
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0].title).toBe('Test Article');
  });
});
