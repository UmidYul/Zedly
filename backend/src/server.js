require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const fs = require('fs');
const crypto = require('crypto');
const { initErrorTracking, captureException, captureMessage } = require('./utils/errorTracking');

const app = express();
const PORT = process.env.PORT || 5000;
const errorTrackingStatus = initErrorTracking();
if (errorTrackingStatus.enabled) {
    console.log(`Error tracking enabled: ${errorTrackingStatus.provider}`);
} else {
    console.log(`Error tracking disabled: ${errorTrackingStatus.reason}`);
}

// ==============================================
// Environment Variables Check
// ==============================================
console.log('\n=== Environment Check ===');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('PORT:', process.env.PORT || 'default 5000');
console.log('DB_HOST:', process.env.DB_HOST || 'not set');
console.log('DB_NAME:', process.env.DB_NAME || 'not set');
console.log('DB_USER:', process.env.DB_USER || 'not set');
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***SET***' : 'NOT SET');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '***SET***' : 'NOT SET');

// Check .env file exists
const envPath = path.join(__dirname, '..', '.env');
const envExists = fs.existsSync(envPath);
console.log('\n.env file exists:', envExists);
console.log('.env path:', envPath);

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

console.log('========================\n');

// ==============================================
// Middleware
// ==============================================

// Security
app.use(helmet({
    contentSecurityPolicy: false, // Настроим позже
}));

// CORS
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
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
    const indexablePaths = new Set(['/', '/index.html']);
    const xRobotsTag = indexablePaths.has(path)
        ? 'index, follow'
        : 'noindex, nofollow, noarchive, nosnippet';
    res.setHeader('X-Robots-Tag', xRobotsTag);
    next();
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
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==============================================
// Serve Frontend (HTML pages)
// ==============================================

// Landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// Dashboard pages (will redirect to appropriate role-based page)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Catch-all route (404)
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
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
    res.sendFile(path.join(__dirname, '..', 'public', 'sitemap.xml'));
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
