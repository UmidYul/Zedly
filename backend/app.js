// cPanel/Passenger startup entrypoint
// Use this file as "Application startup file" in cPanel.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadRuntimeEnv() {
    const explicitEnvFile = process.env.ENV_FILE && String(process.env.ENV_FILE).trim();
    const candidates = [
        explicitEnvFile ? path.resolve(process.cwd(), explicitEnvFile) : null,
        path.resolve(__dirname, '.env'),
        path.resolve(__dirname, '.env.local'),
        path.resolve(__dirname, '..', '.env'),
        path.resolve(__dirname, '..', '.env.prod')
    ].filter(Boolean);

    const uniqueCandidates = Array.from(new Set(candidates));
    for (const envPath of uniqueCandidates) {
        if (!fs.existsSync(envPath)) {
            continue;
        }

        dotenv.config({
            path: envPath,
            override: true
        });
    }
}

loadRuntimeEnv();

const app = require('./src/server');

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`[cpanel] Server listening on ${HOST}:${PORT}`);
});

module.exports = app;
