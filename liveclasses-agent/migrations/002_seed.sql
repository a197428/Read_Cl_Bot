-- Опциональные тестовые данные для локальной разработки
-- В production применять не обязательно.

INSERT INTO users (telegram_id, username)
VALUES
  ('123456789', 'test_admin'),
  ('987654321', 'test_user')
ON CONFLICT(telegram_id) DO NOTHING;
