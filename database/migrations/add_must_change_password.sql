-- Add must_change_password column to users table
-- This column tracks whether a user needs to change their password (e.g., after initial setup)

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- Update existing OTP users to require password change
UPDATE users 
SET must_change_password = true 
WHERE is_otp = true AND must_change_password IS NULL;
