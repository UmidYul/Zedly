#!/bin/bash

# ZEDLY Database Initialization Script
# This script:
# 1. Creates the zedly database (if it doesn't exist)
# 2. Applies the schema (schema_safe.sql)
# 3. Seeds test data (seed_safe.sql)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}ZEDLY Database Initialization${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}ERROR: PostgreSQL is not installed!${NC}"
    echo ""
    echo "To install PostgreSQL on macOS, run:"
    echo "  brew install postgresql@16"
    echo "  brew services start postgresql@16"
    echo ""
    echo "To install on Linux (Ubuntu/Debian), run:"
    echo "  sudo apt-get install postgresql postgresql-contrib"
    echo "  sudo systemctl start postgresql"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ PostgreSQL is installed: $(psql --version)${NC}"
echo ""

# Get database credentials
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-zedly}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

echo "Using configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if SQL files exist
if [ ! -f "$SCRIPT_DIR/schema_safe.sql" ]; then
    echo -e "${RED}ERROR: schema_safe.sql not found at $SCRIPT_DIR/schema_safe.sql${NC}"
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/seed_safe.sql" ]; then
    echo -e "${RED}ERROR: seed_safe.sql not found at $SCRIPT_DIR/seed_safe.sql${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Schema files found${NC}"
echo ""

# Create database if it doesn't exist
echo "Creating database (if needed)..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"

echo -e "${GREEN}✓ Database ready${NC}"
echo ""

# Apply schema
echo "Applying schema (schema_safe.sql)..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/schema_safe.sql" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Schema applied successfully${NC}"
else
    echo -e "${RED}ERROR: Failed to apply schema${NC}"
    exit 1
fi
echo ""

# Apply seed data
echo "Seeding test data (seed_safe.sql)..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/seed_safe.sql" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Seed data loaded successfully${NC}"
else
    echo -e "${RED}ERROR: Failed to load seed data${NC}"
    exit 1
fi
echo ""

# Verify the database
echo "Verifying database..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Database initialization complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Test users created (all password: admin123):"
echo "  - superadmin (Platform admin)"
echo "  - admin1 (School admin)"
echo "  - teacher1 (Teacher)"
echo "  - student1 (Student)"
echo "  - student2 (Student)"
echo ""
echo "Next steps:"
echo "1. Start the ZEDLY server: cd backend && npm run dev"
echo "2. Open http://localhost:5000 in your browser"
echo "3. Login with any test user account"
echo ""
