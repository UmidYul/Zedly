#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { loadEnv } = require('./load-env');

loadEnv();

const MIGRATIONS_DIR = path.resolve(
    __dirname,
    '..',
    '..',
    'database',
    'migrations'
);

function buildPool() {
    return new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number.parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'zedly',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD
    });
}

function sha256(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureMigrationsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id BIGSERIAL PRIMARY KEY,
            file_name TEXT NOT NULL UNIQUE,
            file_hash TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function listMigrationFiles() {
    const includeLegacy = String(process.env.MIGRATION_INCLUDE_LEGACY || '').trim().toLowerCase() === 'true';
    const versionedPattern = /^\d{4}_\d{2}_\d{2}_.+\.(sql|psql)$/i;

    const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => name.endsWith('.sql') || name.endsWith('.psql'))
        .filter((name) => !name.toLowerCase().includes('readme'))
        .filter((name) => includeLegacy || versionedPattern.test(name))
        .sort((a, b) => a.localeCompare(b));
}

async function applyMigration(client, fileName) {
    const fullPath = path.join(MIGRATIONS_DIR, fileName);
    const content = await fs.readFile(fullPath, 'utf8');
    const hash = sha256(content);

    const existing = await client.query(
        'SELECT file_hash FROM schema_migrations WHERE file_name = $1 LIMIT 1',
        [fileName]
    );

    if (existing.rowCount > 0) {
        const currentHash = existing.rows[0].file_hash;
        if (currentHash !== hash) {
            throw new Error(
                `Migration "${fileName}" was changed after being applied. ` +
                `Expected hash=${currentHash}, got=${hash}`
            );
        }
        console.log(`- Skip: ${fileName} (already applied)`);
        return false;
    }

    console.log(`- Apply: ${fileName}`);
    await client.query('BEGIN');
    try {
        await client.query(content);
        await client.query(
            'INSERT INTO schema_migrations (file_name, file_hash) VALUES ($1, $2)',
            [fileName, hash]
        );
        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}

async function main() {
    const pool = buildPool();
    const client = await pool.connect();

    try {
        console.log(`Migration directory: ${MIGRATIONS_DIR}`);
        await ensureMigrationsTable(client);

        const targetFile = process.env.MIGRATION_FILE
            ? String(process.env.MIGRATION_FILE).trim()
            : '';
        const files = targetFile ? [targetFile] : await listMigrationFiles();

        if (files.length === 0) {
            console.log('No migration files found.');
            return;
        }

        let appliedCount = 0;
        for (const fileName of files) {
            const applied = await applyMigration(client, fileName);
            if (applied) {
                appliedCount += 1;
            }
        }

        console.log(`Done. Applied ${appliedCount} migration(s).`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
