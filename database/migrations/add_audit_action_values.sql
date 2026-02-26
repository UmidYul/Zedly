-- Migration: Add password-related values to audit_action enum
-- This migration adds 'password_reset' and 'password_change' to the audit_action enum
-- Optional migration - the application works with 'update' action + details.action_type

-- Add password_reset to audit_action enum if it doesn't exist
DO $$ 
BEGIN
    -- Check if the value already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'password_reset' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action')
    ) THEN
        ALTER TYPE audit_action ADD VALUE 'password_reset';
    END IF;
END $$;

-- Add password_change to audit_action enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'password_change' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action')
    ) THEN
        ALTER TYPE audit_action ADD VALUE 'password_change';
    END IF;
END $$;

-- Note: After adding these values, you can update the backend code to use
-- 'password_reset' and 'password_change' directly instead of 'update' with action_type in details
