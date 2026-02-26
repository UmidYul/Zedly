-- Add bilingual name columns for subjects if missing
ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS name_ru VARCHAR(255),
    ADD COLUMN IF NOT EXISTS name_uz VARCHAR(255);

-- Backfill from legacy name column when present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subjects'
          AND column_name = 'name'
    ) THEN
        UPDATE subjects
        SET
            name_ru = COALESCE(name_ru, name),
            name_uz = COALESCE(name_uz, name)
        WHERE name IS NOT NULL;
    END IF;
END $$;

-- Ensure values exist for new rows in schemas that still write only name
ALTER TABLE subjects
    ALTER COLUMN name_ru SET DEFAULT NULL,
    ALTER COLUMN name_uz SET DEFAULT NULL;
