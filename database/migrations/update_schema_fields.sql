-- Comprehensive migration to add missing fields
-- Date: 2026-02-10

-- ====================================
-- 1. Add color and description to subjects table
-- ====================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subjects' AND column_name = 'color'
    ) THEN
        ALTER TABLE subjects ADD COLUMN color VARCHAR(7) DEFAULT '#4A90E2';
        RAISE NOTICE '✓ Added color column to subjects table';
    ELSE
        RAISE NOTICE '  Color column already exists in subjects table';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subjects' AND column_name = 'description'
    ) THEN
        ALTER TABLE subjects ADD COLUMN description TEXT;
        RAISE NOTICE '✓ Added description column to subjects table';
    ELSE
        RAISE NOTICE '  Description column already exists in subjects table';
    END IF;
END $$;

-- Update existing subjects with default color
UPDATE subjects SET color = '#4A90E2' WHERE color IS NULL;

-- ====================================
-- 2. Add homeroom_teacher_id to classes table
-- ====================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'classes' AND column_name = 'homeroom_teacher_id'
    ) THEN
        ALTER TABLE classes ADD COLUMN homeroom_teacher_id BIGINT;
        ALTER TABLE classes ADD CONSTRAINT fk_classes_homeroom_teacher
            FOREIGN KEY (homeroom_teacher_id) REFERENCES users(id) ON DELETE SET NULL;
        RAISE NOTICE '✓ Added homeroom_teacher_id column to classes table';
    ELSE
        RAISE NOTICE '  homeroom_teacher_id column already exists in classes table';
    END IF;
END $$;

-- ====================================
-- 3. Verification
-- ====================================
DO $$
DECLARE
    v_subjects_color BOOLEAN;
    v_subjects_description BOOLEAN;
    v_classes_homeroom BOOLEAN;
BEGIN
    -- Check subjects.color
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subjects' AND column_name = 'color'
    ) INTO v_subjects_color;

    -- Check subjects.description
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subjects' AND column_name = 'description'
    ) INTO v_subjects_description;

    -- Check classes.homeroom_teacher_id
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'classes' AND column_name = 'homeroom_teacher_id'
    ) INTO v_classes_homeroom;

    RAISE NOTICE '';
    RAISE NOTICE '===================================';
    RAISE NOTICE '    Migration Verification';
    RAISE NOTICE '===================================';
    RAISE NOTICE 'subjects.color ................ %', CASE WHEN v_subjects_color THEN '✓' ELSE '✗' END;
    RAISE NOTICE 'subjects.description .......... %', CASE WHEN v_subjects_description THEN '✓' ELSE '✗' END;
    RAISE NOTICE 'classes.homeroom_teacher_id ... %', CASE WHEN v_classes_homeroom THEN '✓' ELSE '✗' END;
    RAISE NOTICE '===================================';
    RAISE NOTICE '';
END $$;
