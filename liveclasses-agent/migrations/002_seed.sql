-- Опциональные тестовые данные для локальной разработки
-- В production применять не обязательно.

INSERT INTO users (telegram_id, username)
VALUES
  ('123456789', 'test_admin'),
  ('987654321', 'test_user')
ON CONFLICT(telegram_id) DO NOTHING;

INSERT INTO broadcasts (title, start_time, start_datetime, author, url, category)
VALUES
  (
    'Тестовая трансляция по фотографии',
    '15:00',
    datetime('now', '+1 day', 'start of day', '+15 hours'),
    'Тестовый Автор',
    'https://liveclasses.ru/schedule/',
    'Фотография'
  ),
  (
    'Тестовая трансляция по видео',
    '19:30',
    datetime('now', '+1 day', 'start of day', '+19 hours', '+30 minutes'),
    'Тестовый Автор 2',
    'https://liveclasses.ru/schedule/',
    'Видео и звук'
  )
ON CONFLICT(title, start_datetime) DO NOTHING;
