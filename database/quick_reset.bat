@echo off
chcp 65001 > nul
echo.
echo ===================================
echo   ZEDLY - Quick Database Reset
echo ===================================
echo.
echo This will reset the database and load test data.
echo.
pause

echo.
echo [1/2] Resetting database schema...
psql -U postgres -d zedly_db -f schema_safe.sql

echo.
echo [2/2] Loading test data...
psql -U postgres -d zedly_db -f seed_safe.sql

echo.
echo ===================================
echo   Database reset complete!
echo ===================================
echo.
echo Test users (password: admin123):
echo   SuperAdmin:   superadmin
echo   SchoolAdmin:  admin1
echo   Teacher:      teacher1
echo   Student:      student1
echo.
pause
