-- Fix test_questions table structure for inline question storage
-- Run this on production database

-- Drop existing test_questions table (backup first if needed!)
DROP TABLE IF EXISTS test_questions CASCADE;

-- Create new test_questions table with inline question storage
CREATE TABLE test_questions (
    id BIGSERIAL PRIMARY KEY,
    test_id BIGINT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    question_type VARCHAR(50) NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB,
    correct_answer JSONB,
    marks DECIMAL(5,2) DEFAULT 1,
    order_number INT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX idx_test_questions_test_id ON test_questions(test_id);
CREATE INDEX idx_test_questions_order ON test_questions(test_id, order_number);

-- Verify
SELECT 'test_questions table' as table_name,
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
FROM information_schema.tables
WHERE table_name = 'test_questions'
UNION ALL
SELECT 'question_type column' as field_name,
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
FROM information_schema.columns
WHERE table_name = 'test_questions' AND column_name = 'question_type'
UNION ALL
SELECT 'question_text column',
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END
FROM information_schema.columns
WHERE table_name = 'test_questions' AND column_name = 'question_text'
UNION ALL
SELECT 'options column',
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END
FROM information_schema.columns
WHERE table_name = 'test_questions' AND column_name = 'options'
UNION ALL
SELECT 'correct_answer column',
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END
FROM information_schema.columns
WHERE table_name = 'test_questions' AND column_name = 'correct_answer';
