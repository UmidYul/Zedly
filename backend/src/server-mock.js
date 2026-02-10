// Mock Authentication for testing without database
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Mock users for testing
const mockUsers = {
    'superadmin': {
        id: '1',
        username: 'superadmin',
        password: 'admin123',
        role: 'superadmin',
        school_id: null,
        first_name: 'Супер',
        last_name: 'Администратор'
    },
    'admin1': {
        id: '2',
        username: 'admin1',
        password: 'admin123',
        role: 'school_admin',
        school_id: '1',
        first_name: 'Директор',
        last_name: 'Школы'
    },
    'teacher1': {
        id: '3',
        username: 'teacher1',
        password: 'admin123',
        role: 'teacher',
        school_id: '1',
        first_name: 'Учитель',
        last_name: 'Математики'
    },
    'student1': {
        id: '4',
        username: 'student1',
        password: 'admin123',
        role: 'student',
        school_id: '1',
        first_name: 'Ученик',
        last_name: 'Иванов'
    }
};

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'ZEDLY API is running (MOCK MODE - No Database)',
        timestamp: new Date().toISOString()
    });
});

// Mock login endpoint
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    console.log('Login attempt:', username);

    if (!username || !password) {
        return res.status(400).json({
            error: 'validation_error',
            message: 'Username and password are required'
        });
    }

    const user = mockUsers[username];

    if (!user || user.password !== password) {
        return res.status(401).json({
            error: 'invalid_credentials',
            message: 'Invalid username or password'
        });
    }

    // Generate mock tokens
    const mockToken = Buffer.from(JSON.stringify({ 
        id: user.id, 
        username: user.username, 
        role: user.role 
    })).toString('base64');

    res.json({
        message: 'Login successful',
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            school_id: user.school_id,
            full_name: `${user.first_name} ${user.last_name}`
        },
        access_token: mockToken,
        refresh_token: mockToken
    });
});

// Mock refresh endpoint
app.post('/api/auth/refresh', (req, res) => {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
        return res.status(401).json({ error: 'No refresh token' });
    }

    res.json({
        access_token: refresh_token
    });
});

// Catch all - serve index.html for SPA
app.get('*', (req, res) => {
    if (!req.url.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, '../public', 'index.html'));
    } else {
        res.status(404).json({ error: 'API endpoint not found' });
    }
});

app.listen(PORT, () => {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║                                       ║');
    console.log('║   ZEDLY Mock Server is running!       ║');
    console.log('║   (NO DATABASE - Testing Only)        ║');
    console.log('║                                       ║');
    console.log(`║   Port:        ${PORT}                    ║`);
    console.log(`║   URL:         http://localhost:${PORT}  ║`);
    console.log('║                                       ║');
    console.log('║   Test Accounts:                      ║');
    console.log('║   - superadmin / admin123             ║');
    console.log('║   - admin1 / admin123                 ║');
    console.log('║   - teacher1 / admin123               ║');
    console.log('║   - student1 / admin123               ║');
    console.log('║                                       ║');
    console.log('╚═══════════════════════════════════════╝\n');
});
