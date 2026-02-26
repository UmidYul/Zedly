#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function resolveCandidates(customEnvFile) {
    const cwd = process.cwd();
    const scriptDir = __dirname;

    const candidates = [
        customEnvFile ? path.resolve(cwd, customEnvFile) : null,
        path.resolve(cwd, '.env'),
        path.resolve(cwd, '.env.local'),
        path.resolve(cwd, '.env.prod'),
        path.resolve(scriptDir, '..', '.env'),
        path.resolve(scriptDir, '..', '.env.local'),
        path.resolve(scriptDir, '..', '..', '.env'),
        path.resolve(scriptDir, '..', '..', '.env.prod')
    ].filter(Boolean);

    return Array.from(new Set(candidates));
}

function loadEnv() {
    const customEnvFile = process.env.ENV_FILE && String(process.env.ENV_FILE).trim();
    const candidates = resolveCandidates(customEnvFile);

    for (const envPath of candidates) {
        if (!fs.existsSync(envPath)) {
            continue;
        }

        dotenv.config({
            path: envPath,
            override: false
        });
    }
}

module.exports = { loadEnv };
