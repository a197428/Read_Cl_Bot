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

  it('routes broadcast queries correctly', () => {
    const result = understandQuery('какая ближайшая трансляция?');
    expect(result.responseType).toBe('broadcasts');
  });

  it('isArticleQuery returns true for article queries', () => {
    expect(isArticleQuery('что нового по AI?')).toBe(true);
    expect(isArticleQuery('расписание на завтра')).toBe(false);
  });
});
