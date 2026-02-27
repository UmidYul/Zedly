-- Миграция профориентационного модуля
-- Добавить career_module.sql в миграции

-- up
\i ../career_module.sql

-- down
-- Удалить все таблицы профориентации
DROP TABLE IF EXISTS audit_career CASCADE;
DROP TABLE IF EXISTS career_answer_history CASCADE;
DROP TABLE IF EXISTS career_answers CASCADE;
DROP TABLE IF EXISTS career_question_domains CASCADE;
DROP TABLE IF EXISTS career_questions CASCADE;
DROP TABLE IF EXISTS career_domains CASCADE;
DROP TABLE IF EXISTS career_tests CASCADE;
