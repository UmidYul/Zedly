-- Migration: Add is_otp column to users table
-- This column tracks whether a user's current password is a temporary OTP
-- Optional migration - the application works without this column

-- Add is_otp column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'is_otp'
    ) THEN
        ALTER TABLE users ADD COLUMN is_otp BOOLEAN DEFAULT false;
        COMMENT ON COLUMN users.is_otp IS 'One-Time Password flag - indicates if current password is temporary';
    END IF;
END $$;
