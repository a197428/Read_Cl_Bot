import { describe, it, expect } from 'vitest';
import { calculateTotalScore, getBaseScore, pickTopArticles } from './scorer';
import { ProcessedArticle } from '../types';

describe('scorer', () => {
  it('getBaseScore returns correct scores', () => {
    expect(getBaseScore('thenewstack')).toBe(3);
    expect(getBaseScore('infoworld')).toBe(3);
    expect(getBaseScore('tds')).toBe(2);
  });

  it('calculateTotalScore computes correctly', () => {
    expect(calculateTotalScore('thenewstack', 2, 1)).toBe(6);
    expect(calculateTotalScore('tds', 1, 0)).toBe(3);
  });

  it('pickTopArticles returns top N', () => {
    const articles: ProcessedArticle[] = [
      { seen_id: 1, title: 'A', summary: '', key_ideas: [], tags: [], score: 5, source_score: 3, relevance_score: 2, depth_score: 0, url: '' },
      { seen_id: 2, title: 'B', summary: '', key_ideas: [], tags: [], score: 8, source_score: 3, relevance_score: 2, depth_score: 1, url: '' },
      { seen_id: 3, title: 'C', summary: '', key_ideas: [], tags: [], score: 3, source_score: 2, relevance_score: 1, depth_score: 0, url: '' },
    ];

    const top = pickTopArticles(articles, 2);
    expect(top).toHaveLength(2);
    expect(top[0].score).toBe(8);
    expect(top[1].score).toBe(5);
  });
});
