#!/bin/bash
# Script to reset and recreate the database

echo "========================================"
echo "Resetting ZEDLY database..."
echo "========================================"
echo ""

# Drop existing database
echo "Dropping database..."
psql -U postgres -c "DROP DATABASE IF EXISTS zedly;"

# Create new database
echo "Creating database..."
psql -U postgres -c "CREATE DATABASE zedly;"

# Apply schema
echo "Applying schema..."
psql -U postgres -d zedly -f schema_safe.sql

echo ""
echo "========================================"
echo "Database reset complete!"
echo "========================================"
echo ""
echo "To load test data, run:"
echo "psql -U postgres -d zedly -f seed_safe.sql"
echo ""
