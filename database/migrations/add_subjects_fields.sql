-- Migration: Add color and description fields to subjects table
-- Date: 2026-02-10

-- Add color column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'subjects'
        AND column_name = 'color'
    ) THEN
        ALTER TABLE subjects ADD COLUMN color VARCHAR(7) DEFAULT '#4A90E2';
        RAISE NOTICE 'Added color column to subjects table';
    ELSE
        RAISE NOTICE 'Color column already exists in subjects table';
    END IF;
END $$;

-- Add description column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'subjects'
        AND column_name = 'description'
    ) THEN
        ALTER TABLE subjects ADD COLUMN description TEXT;
        RAISE NOTICE 'Added description column to subjects table';
    ELSE
        RAISE NOTICE 'Description column already exists in subjects table';
    END IF;
END $$;

-- Update existing subjects with default colors
UPDATE subjects
SET color = '#4A90E2'
WHERE color IS NULL;

-- Verify the changes
SELECT
    column_name,
    data_type,
    character_maximum_length,
    column_default
FROM information_schema.columns
WHERE table_name = 'subjects'
AND column_name IN ('color', 'description')
ORDER BY ordinal_position;
