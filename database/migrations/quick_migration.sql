-- Quick migration - Run this directly on production server
-- Copy and paste into psql or pgAdmin

-- Add color to subjects (if not exists)
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#4A90E2';
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS description TEXT;
UPDATE subjects SET color = '#4A90E2' WHERE color IS NULL;

-- Add homeroom_teacher_id to classes (if not exists)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS homeroom_teacher_id BIGINT;

-- Add foreign key constraint for classes (only if column was just created)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_classes_homeroom_teacher'
    ) THEN
        ALTER TABLE classes ADD CONSTRAINT fk_classes_homeroom_teacher
            FOREIGN KEY (homeroom_teacher_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add created_by to tests (if not exists)
ALTER TABLE tests ADD COLUMN IF NOT EXISTS created_by BIGINT;

-- Add foreign key constraint for tests (only if column was just created)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_tests_created_by'
    ) THEN
        ALTER TABLE tests ADD CONSTRAINT fk_tests_created_by
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Verify
SELECT 'subjects.color' as field_name,
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
FROM information_schema.columns
WHERE table_name = 'subjects' AND column_name = 'color'
UNION ALL
SELECT 'subjects.description',
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END
FROM information_schema.columns
WHERE table_name = 'subjects' AND column_name = 'description'
UNION ALL
SELECT 'classes.homeroom_teacher_id',
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END
FROM information_schema.columns
WHERE table_name = 'classes' AND column_name = 'homeroom_teacher_id'
UNION ALL
SELECT 'tests.created_by',
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END
FROM information_schema.columns
WHERE table_name = 'tests' AND column_name = 'created_by';
