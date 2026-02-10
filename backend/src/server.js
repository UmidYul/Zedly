require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Student routes (will be added later)
// app.use('/api/student', require('./routes/student'));

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
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal Server Error',
            status: err.status || 500
        }
    });
});

// ==============================================
// Start Server
// ==============================================

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
});

module.exports = app;
