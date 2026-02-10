require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 5000;

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

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==============================================
// API Routes
// ==============================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'ZEDLY API is running',
        timestamp: new Date().toISOString()
    });
});

// Auth routes
app.use('/api/auth', require('./routes/auth'));

// Role-based routes (will be added later)
// app.use('/api/superadmin', require('./routes/superadmin'));
// app.use('/api/admin', require('./routes/admin'));
// app.use('/api/teacher', require('./routes/teacher'));
// app.use('/api/student', require('./routes/student'));

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
});

module.exports = app;
