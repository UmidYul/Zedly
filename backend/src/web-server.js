require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const helmet = require('helmet');

const app = express();
const PORT = Number.parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const shouldServeCompiledFrontend = String(process.env.SERVE_COMPILED_FRONTEND || '').toLowerCase() === 'true';
const compiledPublicDir = path.join(__dirname, '..', 'public-dist');
const sourcePublicDir = path.join(__dirname, '..', 'public');
const hasCompiledFrontend = fs.existsSync(compiledPublicDir);
const publicRoot = (shouldServeCompiledFrontend && hasCompiledFrontend)
    ? compiledPublicDir
    : sourcePublicDir;

app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(compression());

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'web',
        timestamp: new Date().toISOString()
    });
});

app.get('/runtime-config.js', (_req, res) => {
    const configuredApiBase = String(process.env.API_BASE_URL || '').trim();
    const shouldUpgradeToHttps = String(_req.protocol || '').toLowerCase() === 'https';
    const safeApiBase = shouldUpgradeToHttps
        ? configuredApiBase.replace(/^http:\/\//i, 'https://')
        : configuredApiBase;
    const payload = [
        '(function(){',
        'window.__ZEDLY_CONFIG__=window.__ZEDLY_CONFIG__||{};',
        `window.__ZEDLY_CONFIG__.API_BASE_URL=${JSON.stringify(safeApiBase)};`,
        '})();'
    ].join('');
    res.type('application/javascript').send(payload);
});

app.use(express.static(publicRoot));

app.get('/', (_req, res) => {
    res.sendFile(path.join(publicRoot, 'index.html'));
});

app.get('/login', (_req, res) => {
    res.sendFile(path.join(publicRoot, 'login.html'));
});

app.get('/dashboard', (_req, res) => {
    res.sendFile(path.join(publicRoot, 'dashboard.html'));
});

app.get('/robots.txt', (req, res) => {
    const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`)
        .replace(/\/+$/, '')
        .replace(/\/api$/i, '');
    const robots = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /dashboard',
        'Disallow: /dashboard.html',
        'Disallow: /change-password',
        'Disallow: /change-password.html',
        'Disallow: /student-',
        'Disallow: /teacher-',
        'Disallow: /advanced-analytics',
        'Disallow: /grading',
        'Disallow: /grade-attempt',
        'Disallow: /class-details',
        'Disallow: /import-users',
        'Disallow: /telegram-status',
        `Sitemap: ${appUrl}/sitemap.xml`
    ].join('\n');

    res.type('text/plain').send(robots);
});

app.get('/sitemap.xml', (_req, res) => {
    res.sendFile(path.join(publicRoot, 'sitemap.xml'));
});

app.use((req, res) => {
    if (String(req.path || '').startsWith('/api/')) {
        return res.status(404).json({
            error: {
                code: 'not_found',
                message: 'API is served from a different service'
            }
        });
    }
    return res.status(404).sendFile(path.join(publicRoot, '404.html'));
});

app.listen(PORT, HOST, () => {
    console.log(`[web] Server listening on ${HOST}:${PORT}`);
});
