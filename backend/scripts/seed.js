#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');
const { loadEnv } = require('./load-env');

loadEnv();

const DEFAULT_SEED_FILE = path.resolve(
    __dirname,
    '..',
    '..',
    'database',
    'seed_safe.sql'
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

async function main() {
    const seedFile = process.env.SEED_FILE
        ? path.resolve(process.cwd(), process.env.SEED_FILE)
        : DEFAULT_SEED_FILE;

    const sql = await fs.readFile(seedFile, 'utf8');
    const pool = buildPool();
    const client = await pool.connect();

    try {
        console.log(`Applying seed: ${seedFile}`);
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('Seed applied successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error('Seed failed:', error.message);
    process.exit(1);
});
