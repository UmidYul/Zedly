@echo off
REM Script to reset and recreate the database (Windows)

echo ========================================
echo Resetting ZEDLY database...
echo ========================================
echo.

REM Drop existing database
echo Dropping database...
psql -U postgres -c "DROP DATABASE IF EXISTS zedly;"

REM Create new database
echo Creating database...
psql -U postgres -c "CREATE DATABASE zedly;"

REM Apply schema
echo Applying schema...
psql -U postgres -d zedly -f schema_safe.sql

echo.
echo ========================================
echo Database reset complete!
echo ========================================
echo.
echo To load test data, run:
echo psql -U postgres -d zedly -f seed_safe.sql
echo.
