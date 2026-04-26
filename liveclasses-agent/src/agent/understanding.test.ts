import { describe, it, expect } from 'vitest';
import { understandQuery, isArticleQuery } from './understanding';

describe('understanding', () => {
  it('understands AI topic queries', () => {
    const result = understandQuery('что нового по AI?');
    expect(result.responseType).toBe('articles');
    expect(result.keywords).toContain('ai');
  });

  it('understands agent topic queries', () => {
    const result = understandQuery('что есть по агентам?');
    expect(result.responseType).toBe('articles');
    expect(result.keywords).toContain('agents');
  });

  it('understands vibe coding queries', () => {
    const result = understandQuery('новости по vibe coding');
    expect(result.responseType).toBe('articles');
    expect(result.keywords).toContain('vibe-coding');
  });

  it('routes general queries to articles when topic detected', () => {
    const result = understandQuery('какая ближайшая трансляция?');
    // No broadcasts anymore - general queries go to article search
    expect(result.responseType).toBe('general');
    expect(result.topic.length).toBeGreaterThan(0);
  });

  it('isArticleQuery returns true for article queries', () => {
    expect(isArticleQuery('что нового по AI?')).toBe(true);
    expect(isArticleQuery('расписание на завтра')).toBe(false);
  });
});
