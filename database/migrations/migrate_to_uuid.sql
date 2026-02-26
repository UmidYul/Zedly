-- Migration: Convert all BIGINT IDs to UUID
--
-- IMPORTANT: This is a DESTRUCTIVE migration that will:
-- 1. Drop all existing data
-- 2. Recreate tables with UUID primary keys
-- 3. Requires manual data migration if you have existing data
--
-- WARNING: This migration should only be run on:
-- - Fresh database installations
-- - Development/test environments
-- - After backing up production data
--
-- For production with existing data, you'll need to:
-- 1. Export all data with foreign key relationships
-- 2. Generate UUID mappings for all existing IDs  
-- 3. Transform the data
-- 4. Import into new schema
--
-- ============================================================================
-- Note: PostgreSQL 13+ includes gen_random_uuid() by default
-- No extensions are required!
-- ============================================================================

BEGIN;

-- This migration is handled by replacing schema_safe.sql entirely
-- The new schema_safe.sql already contains UUID definitions

-- To migrate:
-- 1. Backup existing database if needed
-- 2. Drop and recreate database: dropdb zedly && createdb zedly
-- 3. Run new schema: psql -U postgres -d zedly -f schema_safe.sql
-- 4. Run new seeds: psql -U postgres -d zedly -f seed_safe.sql

-- Or use the script:
-- cd database
-- psql -U postgres -c "DROP DATABASE IF EXISTS zedly;"
-- psql -U postgres -c "CREATE DATABASE zedly;"
-- psql -U postgres -d zedly -f schema_safe.sql
-- psql -U postgres -d zedly -f seed_safe.sql

ROLLBACK; -- This file is documentation only, not executable

