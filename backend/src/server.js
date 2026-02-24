require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const fs = require('fs');
const crypto = require('crypto');
const { initErrorTracking, captureException, captureMessage } = require('./utils/errorTracking');
const { query } = require('./config/database');
const { sendEmail, isEmailConfigured } = require('./utils/notifications');
const { ensureCsrfCookie, verifyCsrfToken } = require('./middleware/csrf');

const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrigin(rawOrigin) {
    const value = String(rawOrigin || '').trim();
    if (!value) return '';

    try {
        return new URL(value).origin;
    } catch (error) {
        return '';
    }
}

function buildAllowedCorsOrigins() {
    const entries = [];

    [process.env.FRONTEND_URL, process.env.APP_URL].forEach((value) => {
        if (value) entries.push(value);
    });

    const extraOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    entries.push(...extraOrigins);

    const allowed = new Set();
    entries.forEach((entry) => {
        const normalized = normalizeOrigin(entry);
        if (normalized) {
            allowed.add(normalized);
        }
    });

    if (allowed.size === 0 && process.env.NODE_ENV !== 'production') {
        [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5000',
            'http://127.0.0.1:5000'
        ].forEach((origin) => allowed.add(origin));
    }

    return allowed;
}

function buildCspDirectives(allowedOrigins) {
    const connectSrc = new Set(["'self'", 'https:', 'wss:']);
    allowedOrigins.forEach((origin) => {
        connectSrc.add(origin);
    });

    return {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'data:', 'https:'],
        connectSrc: Array.from(connectSrc),
        // Keep local HTTP development stable and avoid forced upgrade loops behind proxies.
        'upgrade-insecure-requests': null
    };
}

const apiRateLimitWindowMs = parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000);
const apiRateLimitMax = parsePositiveInt(process.env.API_RATE_LIMIT_MAX, 240);
const allowedCorsOrigins = buildAllowedCorsOrigins();

const apiRateLimiter = rateLimit({
    windowMs: apiRateLimitWindowMs,
    max: apiRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    message: {
        error: 'too_many_requests',
        message: 'Too many API requests. Please try again later.'
    }
});

const shouldServeCompiledFrontend = String(process.env.SERVE_COMPILED_FRONTEND || '').toLowerCase() === 'true';
const compiledPublicDir = path.join(__dirname, '..', 'public-dist');
const sourcePublicDir = path.join(__dirname, '..', 'public');
const hasCompiledFrontend = fs.existsSync(compiledPublicDir);
const publicRoot = (shouldServeCompiledFrontend && hasCompiledFrontend)
    ? compiledPublicDir
    : sourcePublicDir;

if (shouldServeCompiledFrontend && !hasCompiledFrontend) {
    console.warn('SERVE_COMPILED_FRONTEND=true but public-dist not found, falling back to public/');
}
if (shouldServeCompiledFrontend && hasCompiledFrontend) {
    console.log('Serving compiled frontend from public-dist/');
}
const errorTrackingStatus = initErrorTracking();
if (errorTrackingStatus.enabled) {
    console.log(`Error tracking enabled: ${errorTrackingStatus.provider}`);
} else {
    console.log(`Error tracking disabled: ${errorTrackingStatus.reason}`);
}

// ==============================================
// Environment Variables Check
// ==============================================
const envPath = path.join(__dirname, '..', '.env');
const envExists = fs.existsSync(envPath);
const shouldLogEnvDiagnostics = process.env.NODE_ENV !== 'production'
    || String(process.env.LOG_ENV_DIAGNOSTICS || '').toLowerCase() === 'true';

if (shouldLogEnvDiagnostics) {
    console.log('\n=== Environment Check ===');
    console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
    console.log('PORT:', process.env.PORT || 'default 5000');
    console.log('DB_HOST:', process.env.DB_HOST || 'not set');
    console.log('DB_NAME:', process.env.DB_NAME || 'not set');
    console.log('DB_USER:', process.env.DB_USER || 'not set');
    console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***SET***' : 'NOT SET');
    console.log('JWT_SECRET:', process.env.JWT_SECRET ? '***SET***' : 'NOT SET');
    console.log('\n.env file exists:', envExists);
    console.log('.env path:', envPath);
    console.log('========================\n');
}

if (!envExists) {
    console.warn('\n⚠️  WARNING: .env file not found!');
    console.warn('Create .env file from .env.example');
}

if (!process.env.JWT_SECRET) {
    console.error('\n❌ ERROR: JWT_SECRET not set in .env!');
    console.error('Add JWT_SECRET to your .env file');
}

if (!process.env.DB_PASSWORD) {
    console.warn('\n⚠️  WARNING: DB_PASSWORD not set in .env!');
}

// ==============================================
// Middleware
// ==============================================

// Security
const disableCsp = String(process.env.DISABLE_CSP || '').toLowerCase() === 'true';
const cspDirectives = buildCspDirectives(allowedCorsOrigins);
app.use(helmet({
    contentSecurityPolicy: disableCsp ? false : {
        useDefaults: false,
        directives: cspDirectives
    },
    crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        const normalized = normalizeOrigin(origin);
        if (normalized && allowedCorsOrigins.has(normalized)) {
            return callback(null, true);
        }

        return callback(null, false);
    },
    credentials: true
}));

// Compression
app.use(compression());

// Body parsing
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '20mb';
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }));
app.use((req, res, next) => {
    const incomingId = req.headers['x-request-id'];
    const requestId = typeof incomingId === 'string' && incomingId.trim()
        ? incomingId.trim()
        : crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
});

// SEO: index only the landing page, block private/app pages and API routes.
app.use((req, res, next) => {
    const path = req.path || '/';
    const indexablePaths = new Set(['/']);
    const xRobotsTag = indexablePaths.has(path)
        ? 'index, follow'
        : 'noindex, nofollow, noarchive, nosnippet';
    res.setHeader('X-Robots-Tag', xRobotsTag);
    next();
});

// Canonical URL normalization for SEO.
const canonicalRedirectEnabled = String(process.env.ENABLE_CANONICAL_REDIRECT || '').toLowerCase() === 'true'
    || process.env.NODE_ENV === 'production';

app.use((req, res, next) => {
    if (!canonicalRedirectEnabled) {
        return next();
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
    }

    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL;
    const rawPath = req.path || '/';
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const currentProtocol = forwardedProto || req.protocol;
    const currentHost = req.get('host');

    let redirectUrl = null;

    if (rawPath === '/index.html') {
        const targetPath = '/';
        if (appUrl) {
            const normalizedBase = appUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
            redirectUrl = `${normalizedBase}${targetPath}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
        } else {
            redirectUrl = `${targetPath}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
        }
    }

    if (!redirectUrl && appUrl) {
        try {
            const canonical = new URL(appUrl.replace(/\/+$/, '').replace(/\/api$/i, ''));
            const protocolMismatch = canonical.protocol.replace(':', '') !== currentProtocol;
            const hostMismatch = canonical.host !== currentHost;
            if (protocolMismatch || hostMismatch) {
                redirectUrl = `${canonical.protocol}//${canonical.host}${req.originalUrl || req.url || '/'}`;
            }
        } catch (error) {
            console.warn('Invalid APP_URL/FRONTEND_URL for canonical redirect:', error.message);
        }
    }

    if (!redirectUrl) {
        return next();
    }

    return res.redirect(301, redirectUrl);
});

// Logging
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}

// ==============================================
// API Routes (BEFORE static files!)
// ==============================================

console.log('Loading API routes...');

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'ZEDLY API is running',
        timestamp: new Date().toISOString()
    });
});

app.use('/api', apiRateLimiter);
app.use('/api', ensureCsrfCookie);
app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/public/')) {
        return next();
    }
    return verifyCsrfToken(req, res, next);
});

let landingStatsCache = {
    expiresAt: 0,
    payload: null
};
const landingFeedbackRateLimit = new Map();

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

app.get('/api/public/landing-stats', async (req, res) => {
    try {
        const now = Date.now();
        if (landingStatsCache.payload && now < landingStatsCache.expiresAt) {
            return res.json(landingStatsCache.payload);
        }

        const [classColumnsResult, schoolColumnsResult, userColumnsResult] = await Promise.all([
            query(
                `SELECT column_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'classes'`
            ),
            query(
                `SELECT column_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'schools'`
            ),
            query(
                `SELECT column_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'users'`
            )
        ]);

        const classColumns = new Set(classColumnsResult.rows.map((row) => row.column_name));
        const schoolColumns = new Set(schoolColumnsResult.rows.map((row) => row.column_name));
        const userColumns = new Set(userColumnsResult.rows.map((row) => row.column_name));

        const classesFilter = classColumns.has('is_active') ? 'WHERE is_active = true' : '';
        const schoolsFilter = schoolColumns.has('is_active') ? 'WHERE is_active = true' : '';
        const usersFilter = userColumns.has('is_active') ? 'WHERE is_active = true' : '';

        const usersQuery = query(`SELECT COUNT(*)::int AS total FROM users ${usersFilter}`);
        const schoolsQuery = query(`SELECT COUNT(*)::int AS total FROM schools ${schoolsFilter}`);
        const classesQuery = query(`SELECT COUNT(*)::int AS total FROM classes ${classesFilter}`);
        const [usersCount, schoolsCount, classesCount] = await Promise.all([
            usersQuery,
            schoolsQuery,
            classesQuery,
        ]);

        const payload = {
            stats: {
                total_users: Number(usersCount.rows[0]?.total || 0),
                total_schools: Number(schoolsCount.rows[0]?.total || 0),
                total_classes: Number(classesCount.rows[0]?.total || 0)
            },
            updated_at: new Date().toISOString()
        };

        landingStatsCache = {
            payload,
            expiresAt: now + (5 * 60 * 1000)
        };

        return res.json(payload);
    } catch (error) {
        console.error('Landing stats error:', error);
        return res.status(500).json({
            message: 'Failed to load landing stats'
        });
    }
});

app.post('/api/public/feedback', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const message = String(req.body?.message || '').trim();
        const lang = String(req.body?.lang || 'ru').trim().toLowerCase() === 'uz' ? 'uz' : 'ru';
        const ipKey = String(req.ip || req.headers['x-forwarded-for'] || 'unknown');
        const now = Date.now();
        const recentTs = landingFeedbackRateLimit.get(ipKey) || 0;

        if (now - recentTs < 30_000) {
            return res.status(429).json({
                message: 'Too many requests. Please wait and try again.'
            });
        }

        if (!name || !email || !message) {
            return res.status(400).json({
                message: 'Name, email and message are required.'
            });
        }

        if (name.length > 120 || email.length > 160 || message.length > 5000) {
            return res.status(400).json({
                message: 'Input is too long.'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                message: 'Invalid email format.'
            });
        }

        if (!isEmailConfigured()) {
            return res.status(503).json({
                message: 'Feedback service is temporarily unavailable.'
            });
        }

        const feedbackTo = process.env.LANDING_FEEDBACK_TO || process.env.SUPPORT_EMAIL || 'support@zedly.uz';
        const userAgent = String(req.get('user-agent') || '-');
        const subject = `ZEDLY Landing Feedback [${lang.toUpperCase()}] ${name}`;
        const safeName = escapeHtml(name);
        const safeEmail = escapeHtml(email);
        const safeLang = escapeHtml(lang.toUpperCase());
        const safeIp = escapeHtml(ipKey);
        const safeUa = escapeHtml(userAgent);
        const safeTime = escapeHtml(new Date().toISOString());
        const safeMessageHtml = escapeHtml(message).replace(/\n/g, '<br>');
        const text = [
            'New feedback from landing page',
            '',
            `Name: ${name}`,
            `Email: ${email}`,
            `Language: ${lang}`,
            `IP: ${ipKey}`,
            `User-Agent: ${userAgent}`,
            `Time: ${new Date().toISOString()}`,
            '',
            'Message:',
            message
        ].join('\n');
        const html = `
            <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:20px 24px;background:#1d4ed8;color:#ffffff;">
                    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">ZEDLY</div>
                    <h1 style="margin:8px 0 0;font-size:20px;line-height:1.3;">New feedback from landing page</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                      <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Name</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${safeName}</td></tr>
                      <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Email</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${safeEmail}</td></tr>
                      <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Language</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${safeLang}</td></tr>
                      <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">IP</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${safeIp}</td></tr>
                      <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Time</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${safeTime}</td></tr>
                    </table>
                    <div style="margin-top:16px;padding:14px;border:1px solid #dbeafe;background:#eff6ff;border-radius:10px;">
                      <div style="font-size:12px;color:#1e3a8a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Message</div>
                      <div style="font-size:14px;line-height:1.65;color:#0f172a;">${safeMessageHtml}</div>
                    </div>
                    <div style="margin-top:14px;font-size:12px;color:#94a3b8;">User-Agent: ${safeUa}</div>
                  </td>
                </tr>
              </table>
            </div>
        `;

        const sent = await sendEmail({
            to: feedbackTo,
            replyTo: email,
            subject,
            text,
            html
        });

        if (!sent) {
            return res.status(502).json({
                message: 'Failed to send feedback.'
            });
        }

        landingFeedbackRateLimit.set(ipKey, now);
        captureMessage('Landing feedback sent', 'info', {
            tags: { component: 'landing_feedback' },
            extra: { name, email, lang, ip: ipKey, request_id: req.requestId || null }
        });

        return res.json({
            message: 'Feedback sent successfully.'
        });
    } catch (error) {
        console.error('Landing feedback error:', error);
        return res.status(500).json({
            message: 'Failed to process feedback.'
        });
    }
});

// Auth routes
try {
    const authRouter = require('./routes/auth');
    app.use('/api/auth', authRouter);
    console.log('✓ Auth routes loaded: /api/auth');
} catch (error) {
    console.error('❌ Failed to load auth routes:', error.message);
    console.error(error.stack);
}

// SuperAdmin routes
try {
    const superadminRouter = require('./routes/superadmin');
    app.use('/api/superadmin', superadminRouter);
    console.log('✓ SuperAdmin routes loaded: /api/superadmin');
} catch (error) {
    console.error('❌ Failed to load superadmin routes:', error.message);
    console.error(error.stack);
}

// SchoolAdmin routes
try {
    const adminRouter = require('./routes/admin');
    app.use('/api/admin', adminRouter);
    console.log('✓ SchoolAdmin routes loaded: /api/admin');
} catch (error) {
    console.error('❌ Failed to load admin routes:', error.message);
    console.error(error.stack);
}

// Teacher routes
try {
    const teacherRouter = require('./routes/teacher');
    app.use('/api/teacher', teacherRouter);
    console.log('✓ Teacher routes loaded: /api/teacher');
} catch (error) {
    console.error('❌ Failed to load teacher routes:', error.message);
    console.error(error.stack);
}

// Student routes
try {
    const studentRouter = require('./routes/student');
    app.use('/api/student', studentRouter);
    console.log('✓ Student routes loaded: /api/student');
} catch (error) {
    console.error('❌ Failed to load student routes:', error.message);
    console.error(error.stack);
}

// Psychologist routes
try {
    const psychologistRouter = require('./routes/psychologist');
    app.use('/api/psychologist', psychologistRouter);
    console.log('✓ Psychologist routes loaded: /api/psychologist');
} catch (error) {
    console.error('❌ Failed to load psychologist routes:', error.message);
    console.error(error.stack);
}

// Analytics routes
try {
    const analyticsRouter = require('./routes/analytics');
    app.use('/api/analytics', analyticsRouter);
    console.log('✓ Analytics routes loaded: /api/analytics');
} catch (error) {
    console.error('❌ Failed to load analytics routes:', error.message);
    console.error(error.stack);
}

// Telegram routes
try {
    const telegramRouter = require('./routes/telegram');
    app.use('/api/telegram', telegramRouter);
    console.log('✓ Telegram routes loaded: /api/telegram');
} catch (error) {
    console.error('❌ Failed to load telegram routes:', error.message);
    console.error(error.stack);
}

// Career module routes
try {
    const careerRouter = require('../routes/career');
    app.use('/api/career', careerRouter);
    console.log('✓ Career module routes loaded: /api/career');
} catch (error) {
    console.error('❌ Failed to load career module routes:', error.message);
    console.error(error.stack);
}

// ==============================================
// Serve Static Files (AFTER API routes!)
// ==============================================

// Serve static files (HTML, CSS, JS)
app.use(express.static(publicRoot));

// ==============================================
// Serve Frontend (HTML pages)
// ==============================================

// Landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(publicRoot, 'index.html'));
});

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(publicRoot, 'login.html'));
});

// Dashboard pages (will redirect to appropriate role-based page)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(publicRoot, 'dashboard.html'));
});

// Catch-all route (404)
app.use((req, res) => {
    res.status(404).sendFile(path.join(publicRoot, '404.html'));
});

// ==============================================
// Error Handler
// ==============================================

app.use((err, req, res, next) => {
    captureException(err, {
        tags: {
            route: req.originalUrl || req.url || 'unknown',
            method: req.method || 'unknown'
        },
        user: req.user ? {
            id: req.user.id ? String(req.user.id) : undefined,
            username: req.user.username || undefined,
            role: req.user.role || undefined
        } : undefined,
        extra: {
            request_id: req.requestId || null,
            ip: req.ip || null,
            status: err.status || 500
        }
    });

    console.error(err.stack);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal Server Error',
            status: err.status || 500,
            request_id: req.requestId || null
        }
    });
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

app.get('/sitemap.xml', (req, res) => {
    res.sendFile(path.join(publicRoot, 'sitemap.xml'));
});

// ==============================================
// Start Server
// ==============================================

if (require.main === module) {
    process.on('unhandledRejection', (reason) => {
        console.error('Unhandled promise rejection:', reason);
        captureException(reason instanceof Error ? reason : new Error(String(reason)), {
            tags: { kind: 'unhandledRejection' }
        });
    });

    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error);
        captureException(error, { tags: { kind: 'uncaughtException' } });
    });

    app.listen(PORT, () => {
        console.log(`
        ╔═══════════════════════════════════════╗
        ║                                       ║
        ║   ZEDLY Server is running!            ║
        ║                                       ║
        ║   Port:        ${PORT}                    ║
        ║   Environment: ${process.env.NODE_ENV || 'development'}          ║
        ║   URL:         http://localhost:${PORT}   ║
        ║                                       ║
        ╚═══════════════════════════════════════╝
        `);

        console.log('📍 Registered routes:');
        console.log('   GET  /api/health');
        console.log('   POST /api/auth/login');
        console.log('   POST /api/auth/refresh');
        console.log('   POST /api/auth/logout');
        console.log('   GET  /api/auth/me');
        console.log('   GET  /');
        console.log('   GET  /login');
        console.log('   GET  /dashboard');
        console.log('');
        captureMessage('Server started', 'info', {
            tags: { component: 'server' },
            extra: { port: PORT, env: process.env.NODE_ENV || 'development' }
        });
    });

    try {
        const { startDeadlineReminderJob } = require('./jobs/deadlineReminders');
        startDeadlineReminderJob();
    } catch (jobError) {
        console.error('Failed to start deadline reminder job:', jobError.message);
    }

    try {
        const { startNotificationDigestJob } = require('./jobs/notificationDigest');
        startNotificationDigestJob();
    } catch (jobError) {
        console.error('Failed to start notification digest job:', jobError.message);
    }
}

module.exports = app;
