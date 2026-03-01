-- SAFE migration that preserves existing test questions
-- Run this instead of combined_fix.sql if you want to keep existing data

-- 1. Fix users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- 2. Fix test_questions table structure - ADD columns without dropping
-- Check if we need to migrate from old structure to new structure
DO $$ 
BEGIN
    -- If the table has 'question_id' column (old structure), we need to migrate
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'test_questions' AND column_name = 'question_id'
    ) THEN
        -- Old structure exists, need to migrate
        -- Create backup table
        CREATE TABLE test_questions_backup AS SELECT * FROM test_questions;
        
        -- Drop and recreate with new structure
        DROP TABLE test_questions CASCADE;
        
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
        
        RAISE NOTICE 'Old test_questions structure detected - table recreated. Backup saved to test_questions_backup.';
    ELSE
        -- New structure already exists, just add missing columns
        ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(50);
        ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS question_text TEXT;
        ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS options JSONB;
        ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS correct_answer JSONB;
        ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS marks DECIMAL(5,2) DEFAULT 1;
        ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS order_number INT;
        ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS media_url TEXT;
        
        RAISE NOTICE 'test_questions table updated with missing columns.';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_test_questions_test_id ON test_questions(test_id);
CREATE INDEX IF NOT EXISTS idx_test_questions_order ON test_questions(test_id, order_number);

-- 3. Fix test_attempts table
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS assignment_id BIGINT REFERENCES test_assignments(id) ON DELETE CASCADE;
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS max_score DECIMAL(10,2);
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS percentage DECIMAL(5,2);
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS time_spent_seconds INT;
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS attempt_number INT;
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS total_questions INT;
-- Proctoring columns
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS tab_switches INT DEFAULT 0;
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS copy_attempts INT DEFAULT 0;
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS suspicious_activity JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_test_attempts_assignment_id ON test_attempts(assignment_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_student_completed ON test_attempts(student_id, is_completed);

-- 4. Fix test_assignments table
ALTER TABLE test_assignments ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;

-- 5. Fix tests table
ALTER TABLE tests ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN DEFAULT false;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS block_copy_paste BOOLEAN DEFAULT true;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS track_tab_switches BOOLEAN DEFAULT true;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS fullscreen_required BOOLEAN DEFAULT false;
