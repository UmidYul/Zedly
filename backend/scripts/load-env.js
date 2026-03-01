#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function resolveCandidates(customEnvFile) {
    const cwd = process.cwd();
    const scriptDir = __dirname;
    const backendRoot = path.resolve(scriptDir, '..');
    const repoRoot = path.resolve(scriptDir, '..', '..');

    const candidates = [
        customEnvFile ? path.resolve(cwd, customEnvFile) : null,
        path.resolve(backendRoot, '.env'),
        path.resolve(backendRoot, '.env.local'),
        path.resolve(backendRoot, '.env.prod'),
        path.resolve(cwd, '.env'),
        path.resolve(cwd, '.env.local'),
        path.resolve(cwd, '.env.prod'),
        path.resolve(repoRoot, '.env'),
        path.resolve(repoRoot, '.env.local'),
        path.resolve(repoRoot, '.env.prod')
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
