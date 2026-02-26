#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { loadEnv } = require('./load-env');

loadEnv();

function timestamp() {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const min = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function runPgDump({ outputPath }) {
    return new Promise((resolve, reject) => {
        const host = process.env.DB_HOST || 'localhost';
        const port = process.env.DB_PORT || '5432';
        const database = process.env.DB_NAME || 'zedly';
        const user = process.env.DB_USER || 'postgres';
        const password = process.env.DB_PASSWORD || '';

        const args = [
            '--format=custom',
            '--no-owner',
            '--host', host,
            '--port', String(port),
            '--username', user,
            '--file', outputPath,
            database
        ];

        const child = spawn('pg_dump', args, {
            stdio: 'inherit',
            env: {
                ...process.env,
                PGPASSWORD: password
            }
        });

        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`pg_dump exited with code ${code}`));
        });
    });
}

async function main() {
    const backupDir = path.resolve(
        process.cwd(),
        process.env.BACKUP_DIR || './backups'
    );
    await fs.mkdir(backupDir, { recursive: true });

    const outputPath = path.join(
        backupDir,
        `zedly_${timestamp()}.dump`
    );

    console.log(`Creating backup: ${outputPath}`);
    await runPgDump({ outputPath });
    console.log('Backup completed successfully.');
}

main().catch((error) => {
    console.error('Backup failed:', error.message);
    if (error.message.includes('ENOENT')) {
        console.error('pg_dump is not available in PATH.');
    }
    process.exit(1);
});
