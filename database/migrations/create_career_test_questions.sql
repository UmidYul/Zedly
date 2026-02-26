-- Career module: вопросы профтестов
CREATE TABLE IF NOT EXISTS career_test_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES career_tests(id) ON DELETE CASCADE,
    question_text_ru TEXT NOT NULL,
    question_text_uz TEXT NOT NULL,
    options JSONB NOT NULL, -- [{text_ru, text_uz, value}, ...]
    order_number INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_career_test_questions_test_id ON career_test_questions(test_id);
CREATE INDEX IF NOT EXISTS idx_career_test_questions_order ON career_test_questions(test_id, order_number);
