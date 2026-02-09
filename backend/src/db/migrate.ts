import fs from 'fs/promises';
import path from 'path';
import { query, transaction } from './index';
import { PoolClient } from 'pg';

interface Migration {
  id: number;
  name: string;
  applied_at: Date;
}

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Ensure migrations table exists
async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// Get applied migrations
async function getAppliedMigrations(): Promise<Migration[]> {
  const result = await query<Migration>(
    'SELECT id, name, applied_at FROM migrations ORDER BY id ASC'
  );
  return result.rows;
}

// Get pending migration files
async function getPendingMigrations(): Promise<string[]> {
  await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
  const files = await fs.readdir(MIGRATIONS_DIR);
  const migrationFiles = files
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = await getAppliedMigrations();
  const appliedNames = new Set(applied.map((m) => m.name));

  return migrationFiles.filter((f) => !appliedNames.has(f));
}

// Apply a single migration
async function applyMigration(client: PoolClient, filename: string): Promise<void> {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(filepath, 'utf-8');

  console.log(`Applying migration: ${filename}`);

  // Execute migration SQL
  await client.query(sql);

  // Record migration
  await client.query(
    'INSERT INTO migrations (name) VALUES ($1)',
    [filename]
  );

  console.log(`✓ Applied migration: ${filename}`);
}

// Run all pending migrations
export async function migrateUp(): Promise<void> {
  await ensureMigrationsTable();
  const pending = await getPendingMigrations();

  if (pending.length === 0) {
    console.log('No pending migrations');
    return;
  }

  console.log(`Found ${pending.length} pending migration(s)`);

  for (const filename of pending) {
    await transaction(async (client) => {
      await applyMigration(client, filename);
    });
  }

  console.log('All migrations applied successfully');
}

// Rollback last migration (basic implementation)
export async function migrateDown(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  if (applied.length === 0) {
    console.log('No migrations to rollback');
    return;
  }

  const last = applied[applied.length - 1];
  console.log(`Rolling back migration: ${last.name}`);

  // Note: This is a basic implementation
  // In production, you'd want separate down migration files
  await transaction(async (client) => {
    await client.query('DELETE FROM migrations WHERE name = $1', [last.name]);
  });

  console.log(`✓ Rolled back migration: ${last.name}`);
  console.log('WARNING: Schema changes were NOT automatically reverted');
  console.log('You must manually revert the schema changes from the migration');
}

// Create a new migration file
export async function createMigration(name: string): Promise<void> {
  await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
  const timestamp = Date.now();
  const filename = `${timestamp}_${name.replace(/\s+/g, '_')}.sql`;
  const filepath = path.join(MIGRATIONS_DIR, filename);

  const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Add your SQL here

`;

  await fs.writeFile(filepath, template, 'utf-8');
  console.log(`Created migration: ${filename}`);
}

// CLI handler
if (require.main === module) {
  const command = process.argv[2];
  const arg = process.argv[3];

  (async () => {
    try {
      switch (command) {
        case 'up':
          await migrateUp();
          break;
        case 'down':
          await migrateDown();
          break;
        case 'create':
          if (!arg) {
            console.error('Usage: npm run migrate:create <migration_name>');
            process.exit(1);
          }
          await createMigration(arg);
          break;
        default:
          console.log('Usage:');
          console.log('  npm run migrate:up     - Apply pending migrations');
          console.log('  npm run migrate:down   - Rollback last migration');
          console.log('  npm run migrate:create <name> - Create new migration');
          process.exit(1);
      }
      process.exit(0);
    } catch (error) {
      console.error('Migration error:', error);
      process.exit(1);
    }
  })();
}
