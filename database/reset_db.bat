@echo off
REM ZEDLY Database Initialization Script for Windows
REM This script:
REM 1. Creates the zedly database (if it doesn't exist)
REM 2. Applies the schema (schema_safe.sql)
REM 3. Seeds test data (seed_safe.sql)

setlocal enabledelayedexpansion

echo.
echo ========================================
echo ZEDLY Database Initialization
echo ========================================
echo.

REM Check if PostgreSQL is installed
where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: PostgreSQL is not installed or not in PATH!
    echo.
    echo To install PostgreSQL on Windows:
    echo 1. Download from https://www.postgresql.org/download/windows/
    echo 2. Run the installer and follow the steps
    echo 3. Make sure to add PostgreSQL bin folder to system PATH
    echo 4. Restart this command prompt
    echo.
    pause
    exit /b 1
)

echo [OK] PostgreSQL is installed
psql --version
echo.

REM Set database credentials (can override with environment variables)
if "%DB_HOST%"=="" set "DB_HOST=localhost"
if "%DB_PORT%"=="" set "DB_PORT=5432"
if "%DB_NAME%"=="" set "DB_NAME=zedly"
if "%DB_USER%"=="" set "DB_USER=postgres"
if "%DB_PASSWORD%"=="" set "DB_PASSWORD=postgres"

echo Using configuration:
echo   Host: %DB_HOST%
echo   Port: %DB_PORT%
echo   Database: %DB_NAME%
echo   User: %DB_USER%
echo.

REM Get the directory where this script is located
for %%i in ("%~dp0.") do set "SCRIPT_DIR=%%~fi"

REM Check if SQL files exist
if not exist "%SCRIPT_DIR%\schema_safe.sql" (
    echo ERROR: schema_safe.sql not found at %SCRIPT_DIR%\schema_safe.sql
    pause
    exit /b 1
)

if not exist "%SCRIPT_DIR%\seed_safe.sql" (
    echo ERROR: seed_safe.sql not found at %SCRIPT_DIR%\seed_safe.sql
    pause
    exit /b 1
)

echo [OK] Schema files found
echo.

REM Create database if it doesn't exist
echo Creating database (if needed)...
set "PGPASSWORD=%DB_PASSWORD%"

psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -tc "SELECT 1 FROM pg_database WHERE datname = '%DB_NAME%'" | findstr /r "1" >nul
if %ERRORLEVEL% neq 0 (
    echo Creating new database...
    psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -c "CREATE DATABASE %DB_NAME%;"
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to create database
        echo Make sure PostgreSQL is running and you have correct credentials
        pause
        exit /b 1
    )
)

echo [OK] Database ready
echo.

REM Apply schema
echo Applying schema (schema_safe.sql)...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f "%SCRIPT_DIR%\schema_safe.sql" >nul 2>&1

if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to apply schema
    echo Check PostgreSQL is running and credentials are correct
    pause
    exit /b 1
)

echo [OK] Schema applied successfully
echo.

REM Apply seed data
echo Seeding test data (seed_safe.sql)...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f "%SCRIPT_DIR%\seed_safe.sql" >nul 2>&1

if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to load seed data
    echo Check that the database and schema were created successfully
    pause
    exit /b 1
)

echo [OK] Seed data loaded successfully
echo.

REM Verify the database
echo Verifying database...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema='public';" >nul 2>&1

echo.
echo ========================================
echo [OK] Database initialization complete!
echo ========================================
echo.
echo Test users created (all password: admin123):
echo   - superadmin (Platform admin)
echo   - admin1 (School admin)
echo   - teacher1 (Teacher)
echo   - student1 (Student)
echo   - student2 (Student)
echo.
echo Next steps:
echo 1. Open Command Prompt in backend folder
echo 2. Run: npm run dev
echo 3. Open http://localhost:5000 in your browser
echo 4. Login with any test user account
echo.
pause
