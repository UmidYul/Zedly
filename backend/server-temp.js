// Temporary server without database for testing
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Mock users
const users = {
    'superadmin': { id: '1', username: 'superadmin', password: 'admin123', role: 'superadmin', school_id: null, first_name: 'Супер', last_name: 'Администратор' },
    'admin1': { id: '2', username: 'admin1', password: 'admin123', role: 'school_admin', school_id: '1', first_name: 'Директор', last_name: 'Школы' },
    'teacher1': { id: '3', username: 'teacher1', password: 'admin123', role: 'teacher', school_id: '1', first_name: 'Учитель', last_name: 'Математики' },
    'student1': { id: '4', username: 'student1', password: 'admin123', role: 'student', school_id: '1', first_name: 'Ученик', last_name: 'Иванов' }
};

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'ZEDLY Server Running', timestamp: new Date().toISOString() });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt: ${username}`);

    if (!username || !password) {
        return res.status(400).json({ error: 'validation_error', message: 'Username and password are required' });
    }

    const user = users[username];
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid username or password' });
    }

    const token = Buffer.from(JSON.stringify({ id: user.id, username: user.username, role: user.role })).toString('base64');

    console.log(`✅ Login successful: ${username} (${user.role})`);

    res.json({
        message: 'Login successful',
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            school_id: user.school_id,
            full_name: `${user.first_name} ${user.last_name}`
        },
        access_token: token,
        refresh_token: token
    });
});

// Refresh token
app.post('/api/auth/refresh', (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(401).json({ error: 'No refresh token' });
    res.json({ access_token: refresh_token });
});

// Serve pages
app.get('*', (req, res) => {
    if (!req.url.startsWith('/api/')) {
        const page = req.url === '/' ? 'index.html' : req.url.substring(1);
        res.sendFile(path.join(__dirname, '../public', page));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

app.listen(PORT, () => {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   ZEDLY Server is running!            ║');
    console.log(`║   Port: ${PORT}                           ║`);
    console.log(`║   URL:  http://localhost:${PORT}         ║`);
    console.log('║                                       ║');
    console.log('║   Login: superadmin / admin123        ║');
    console.log('╚═══════════════════════════════════════╝\n');
});
