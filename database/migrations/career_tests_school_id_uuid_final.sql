-- Migration: convert career_tests.school_id to UUID (safe + idempotent)
DO $$
DECLARE
    has_career_tests BOOLEAN;
    has_schools BOOLEAN;
    school_id_type TEXT;
    missing_count BIGINT;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'career_tests'
    ) INTO has_career_tests;

    IF NOT has_career_tests THEN
        RAISE NOTICE 'Skip migration: table public.career_tests does not exist.';
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'schools'
    ) INTO has_schools;

    IF NOT has_schools THEN
        RAISE EXCEPTION 'Table public.schools does not exist.';
    END IF;

    SELECT data_type
    INTO school_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'career_tests'
      AND column_name = 'school_id';

    IF school_id_type IS NULL THEN
        RAISE NOTICE 'Skip migration: column career_tests.school_id does not exist.';
        RETURN;
    END IF;

    -- Already migrated: ensure FK shape and exit.
    IF school_id_type = 'uuid' THEN
        ALTER TABLE public.career_tests DROP CONSTRAINT IF EXISTS fk_career_tests_school_id;
        ALTER TABLE public.career_tests DROP CONSTRAINT IF EXISTS career_tests_school_id_fkey;
        ALTER TABLE public.career_tests
            ADD CONSTRAINT career_tests_school_id_fkey
            FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Skip conversion: career_tests.school_id is already UUID.';
        RETURN;
    END IF;

    ALTER TABLE public.career_tests ADD COLUMN IF NOT EXISTS school_id_uuid UUID;

    -- 1) Direct match (works when legacy value already stores UUID-like text)
    UPDATE public.career_tests ct
    SET school_id_uuid = s.id
    FROM public.schools s
    WHERE ct.school_id_uuid IS NULL
      AND ct.school_id::text = s.id::text;

    -- 2) Fallback legacy mapping by deterministic row number.
    WITH school_map AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
        FROM public.schools
    )
    UPDATE public.career_tests ct
    SET school_id_uuid = sm.id
    FROM school_map sm
    WHERE ct.school_id_uuid IS NULL
      AND ct.school_id::text = sm.rn::text;

    SELECT COUNT(*)
    INTO missing_count
    FROM public.career_tests
    WHERE school_id IS NOT NULL
      AND school_id_uuid IS NULL;

    IF missing_count > 0 THEN
        RAISE EXCEPTION 'career_tests.school_id -> UUID mapping failed for % row(s).', missing_count;
    END IF;

    ALTER TABLE public.career_tests DROP CONSTRAINT IF EXISTS fk_career_tests_school_id;
    ALTER TABLE public.career_tests DROP CONSTRAINT IF EXISTS career_tests_school_id_fkey;
    ALTER TABLE public.career_tests DROP COLUMN school_id;
    ALTER TABLE public.career_tests RENAME COLUMN school_id_uuid TO school_id;
    ALTER TABLE public.career_tests ALTER COLUMN school_id SET NOT NULL;
    ALTER TABLE public.career_tests
        ADD CONSTRAINT career_tests_school_id_fkey
        FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
END $$;
