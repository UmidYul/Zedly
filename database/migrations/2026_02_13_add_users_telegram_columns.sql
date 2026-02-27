-- Add required users columns for Telegram self-service and notifications
-- Safe to run multiple times.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'Table public.users does not exist';
    END IF;
END $$;

-- Core columns required by telegram routes
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS telegram_id BIGINT;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Normalize settings column to JSONB if it exists in legacy schema as JSON/TEXT/VARCHAR
DO $$
DECLARE
    settings_type text;
BEGIN
    SELECT data_type
    INTO settings_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'settings';

    IF settings_type = 'json' THEN
        ALTER TABLE public.users
            ALTER COLUMN settings TYPE jsonb
            USING settings::jsonb;
    ELSIF settings_type IN ('text', 'character varying') THEN
        ALTER TABLE public.users
            ALTER COLUMN settings TYPE jsonb
            USING CASE
                WHEN settings IS NULL OR btrim(settings) = '' THEN '{}'::jsonb
                ELSE settings::jsonb
            END;
    END IF;
END $$;

-- Ensure defaults/nullability for settings after type normalization
ALTER TABLE public.users
    ALTER COLUMN settings SET DEFAULT '{}'::jsonb;

UPDATE public.users
SET settings = '{}'::jsonb
WHERE settings IS NULL;

ALTER TABLE public.users
    ALTER COLUMN settings SET NOT NULL;

-- Useful lookup index for Telegram messaging
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);

COMMIT;
