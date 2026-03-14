-- Add support for control works + manual review questions
-- Date: 2026-03-14

-- ====================================
-- 1. test_assignments: assignment_type + reveal_answers_after_deadline
-- ====================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'test_assignments' AND column_name = 'assignment_type'
    ) THEN
        ALTER TABLE test_assignments
            ADD COLUMN assignment_type TEXT NOT NULL DEFAULT 'test';
        RAISE NOTICE '✓ Added test_assignments.assignment_type';
    ELSE
        RAISE NOTICE '  test_assignments.assignment_type already exists';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'test_assignments' AND column_name = 'reveal_answers_after_deadline'
    ) THEN
        ALTER TABLE test_assignments
            ADD COLUMN reveal_answers_after_deadline BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE '✓ Added test_assignments.reveal_answers_after_deadline';
    ELSE
        RAISE NOTICE '  test_assignments.reveal_answers_after_deadline already exists';
    END IF;
END $$;

-- ====================================
-- 2. test_questions: requires_manual_review
-- ====================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'test_questions' AND column_name = 'requires_manual_review'
    ) THEN
        ALTER TABLE test_questions
            ADD COLUMN requires_manual_review BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE '✓ Added test_questions.requires_manual_review';
    ELSE
        RAISE NOTICE '  test_questions.requires_manual_review already exists';
    END IF;
END $$;

-- ====================================
-- 3. Optional check constraint for assignment_type (safe to skip if exists)
-- ====================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_test_assignments_assignment_type'
    ) THEN
        ALTER TABLE test_assignments
            ADD CONSTRAINT chk_test_assignments_assignment_type
            CHECK (assignment_type IN ('test', 'control'));
        RAISE NOTICE '✓ Added chk_test_assignments_assignment_type';
    ELSE
        RAISE NOTICE '  chk_test_assignments_assignment_type already exists';
    END IF;
END $$;

