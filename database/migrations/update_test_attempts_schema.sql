-- Update test_attempts table to match application requirements
-- This migration adds missing columns and adjusts existing ones

-- Add assignment_id column to track which assignment this attempt is for
ALTER TABLE test_attempts 
ADD COLUMN IF NOT EXISTS assignment_id BIGINT REFERENCES test_assignments(id) ON DELETE CASCADE;

-- Add max_score column to track the maximum possible score for this attempt
ALTER TABLE test_attempts 
ADD COLUMN IF NOT EXISTS max_score DECIMAL(10,2);

-- Add percentage column to store the percentage score
ALTER TABLE test_attempts 
ADD COLUMN IF NOT EXISTS percentage DECIMAL(5,2);

-- Add submitted_at column to track when the attempt was submitted
ALTER TABLE test_attempts 
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;

-- Add time_spent_seconds column (similar to duration_seconds but more explicit)
ALTER TABLE test_attempts 
ADD COLUMN IF NOT EXISTS time_spent_seconds INT;

-- Add attempt_number if it doesn't exist (nullable, auto-calculated)
ALTER TABLE test_attempts 
ADD COLUMN IF NOT EXISTS attempt_number INT;

-- Add total_questions if it doesn't exist (nullable, calculated from test)
ALTER TABLE test_attempts 
ADD COLUMN IF NOT EXISTS total_questions INT;

-- Create index on assignment_id for better query performance
CREATE INDEX IF NOT EXISTS idx_test_attempts_assignment_id ON test_attempts(assignment_id);

-- Create index on student_id and is_completed for better query performance
CREATE INDEX IF NOT EXISTS idx_test_attempts_student_completed ON test_attempts(student_id, is_completed);
