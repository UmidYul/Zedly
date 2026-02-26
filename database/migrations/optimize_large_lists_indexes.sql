-- Performance migration for large schools (thousands of students)
-- Safe to run multiple times.

BEGIN;

-- Core list queries in admin routes:
-- users    -> WHERE school_id [+ role] ORDER BY created_at DESC
-- classes  -> WHERE school_id [+ grade/grade_level] ORDER BY grade/name
-- subjects -> WHERE school_id ORDER BY name*

CREATE INDEX IF NOT EXISTS idx_users_school_created_at_desc
    ON public.users (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_school_role_created_at_desc
    ON public.users (school_id, role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_classes_school_created_at_desc
    ON public.classes (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subjects_school_created_at_desc
    ON public.subjects (school_id, created_at DESC);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'classes'
          AND column_name = 'grade_level'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_classes_school_grade_level_name
                 ON public.classes (school_id, grade_level, name)';
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'classes'
          AND column_name = 'grade'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_classes_school_grade_name
                 ON public.classes (school_id, grade, name)';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subjects'
          AND column_name = 'name_ru'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subjects_school_name_ru
                 ON public.subjects (school_id, name_ru)';
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subjects'
          AND column_name = 'name'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subjects_school_name
                 ON public.subjects (school_id, name)';
    END IF;
END $$;

COMMIT;

-- Try enabling trigrams for ILIKE '%...%' searches.
-- If privileges are insufficient, migration still remains usable.
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE 'No privilege to create pg_trgm extension. Skipping trigram indexes.';
            RETURN;
        WHEN undefined_file THEN
            RAISE NOTICE 'pg_trgm extension is not available on this server. Skipping trigram indexes.';
            RETURN;
    END;

    -- users search fields
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'first_name') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_first_name_trgm ON public.users USING gin (lower(first_name) gin_trgm_ops)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_name') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_last_name_trgm ON public.users USING gin (lower(last_name) gin_trgm_ops)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON public.users USING gin (lower(username) gin_trgm_ops)';
    END IF;

    -- classes search fields
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'name') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_classes_name_trgm ON public.classes USING gin (lower(name) gin_trgm_ops)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'academic_year') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_classes_academic_year_trgm ON public.classes USING gin (lower(academic_year) gin_trgm_ops)';
    END IF;

    -- subjects search fields
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'name_ru') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subjects_name_ru_trgm ON public.subjects USING gin (lower(name_ru) gin_trgm_ops)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'name_uz') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subjects_name_uz_trgm ON public.subjects USING gin (lower(name_uz) gin_trgm_ops)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'name') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subjects_name_trgm ON public.subjects USING gin (lower(name) gin_trgm_ops)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'code') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subjects_code_trgm ON public.subjects USING gin (lower(code) gin_trgm_ops)';
    END IF;
END $$;

