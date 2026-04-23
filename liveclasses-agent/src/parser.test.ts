import { describe, expect, it } from 'vitest';
import { testParser } from './parser';

describe('parser', () => {
  it('extracts tomorrow broadcasts from schedule section', () => {
    const html = `
      <div class="schedule__header">
        <div class="schedule__subtitle">Сегодня, 23 Апреля</div>
      </div>
      <div class="product-list__wrapper">
        <div class="product">
          <div class="product__name">Сегодняшний эфир</div>
          <div class="product__author">Автор Сегодня</div>
          <a class="workshop__link" href="/course/photo/today/"></a>
          <div class="product__status">Начнётся в 18:00 (Московское время)</div>
        </div>
      </div>

      <div class="schedule__header">
        <div class="schedule__subtitle">Завтра, 24 Апреля</div>
      </div>
      <div class="product-list__wrapper">
        <div class="product">
          <div class="product__name">Тестовый мастер-класс по фото</div>
          <div class="product__author">Антон Мартынов</div>
          <a class="workshop__link" href="/course/photo/masterclass/"></a>
          <div class="product__status">Начнётся в 09:30 (Московское время)</div>
        </div>
        <div class="product">
          <div class="product__name">Тестовый мастер-класс по видео</div>
          <div class="product__author">Дмитрий Ларионов</div>
          <a class="workshop__link" href="/course/video_and_audio/live-editing/"></a>
          <div class="product__status">Начнётся в 21:10 (Московское время)</div>
        </div>
      </div>
    `;

    const result = testParser(html);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      title: 'Тестовый мастер-класс по фото',
      author: 'Антон Мартынов',
      start_time: '09:30',
      category: 'Фотография',
      url: 'https://liveclasses.ru/course/photo/masterclass/',
    });
    expect(result[1]).toMatchObject({
      title: 'Тестовый мастер-класс по видео',
      author: 'Дмитрий Ларионов',
      start_time: '21:10',
      category: 'Видео и звук',
      url: 'https://liveclasses.ru/course/video_and_audio/live-editing/',
    });
  });

  it('returns empty list when tomorrow section is absent', () => {
    const html = `<html><body><div class="schedule-day__title">Сегодня</div></body></html>`;

    const result = testParser(html);
    expect(result).toEqual([]);
  });
});
