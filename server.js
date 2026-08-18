const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@libsql/client');
const cron = require('node-cron');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'profit_house_secret_2026';

// ================================================
// TURSO DB CONNECTION
// ================================================
const turso = createClient({
    url: process.env.TURSO_URL || 'libsql://pvyapyvapyva-capitalflow21.aws-eu-west-1.turso.io',
    authToken: process.env.TURSO_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODcwNjEwNDAsImlkIjoiMDFhMDAxMmEtOTgwMS03MDY1LTllOGMtMDc5YTNlZTI1MmE4Iiwia2lkIjoiTGhMc2FMYTlmM01IZ1ZXUDN6OXZlZHVoS3pyVWd5MVdqM0JQMFM5bThPYyIsInJpZCI6ImI5YzdmYjMxLTdjODItNDIzYS1hZjAwLTUzZWMyN2I5M2Y1OSJ9.Fg0XHHrNfZv9HJuiZxcz3Dsac0DkiZHiGatwsmVbf2tNlarJv9w1o8ClltmBTT9FAmHsJfVJ6GzsQ0zhgbXgAQ'
});

console.log('🔗 Connected to Turso DB');

// ================================================
// MIDDLEWARE
// ================================================
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================================================
// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
// ================================================
async function initDatabase() {
    try {
        // Users table
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                status TEXT DEFAULT 'active',
                created TEXT NOT NULL,
                balance REAL DEFAULT 0,
                totalInvested REAL DEFAULT 0,
                refCode TEXT UNIQUE,
                referredBy TEXT,
                taskCompleted TEXT DEFAULT '{}',
                dailyTasksCompleted INTEGER DEFAULT 0,
                lastTaskDate TEXT
            )
        `);

        // Transactions table
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                type TEXT NOT NULL,
                amount TEXT NOT NULL,
                method TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                date TEXT NOT NULL
            )
        `);

        // Funds table
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS funds (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                min REAL NOT NULL,
                roi REAL NOT NULL,
                task TEXT NOT NULL,
                status TEXT DEFAULT 'active'
            )
        `);

        // Projects table
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                desc TEXT NOT NULL,
                profit TEXT NOT NULL,
                min TEXT NOT NULL,
                risk TEXT NOT NULL,
                duration TEXT DEFAULT '14 days',
                image TEXT,
                status TEXT DEFAULT 'active',
                created TEXT NOT NULL,
                updated TEXT NOT NULL
            )
        `);

        // Daily Projects
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS daily_projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                desc TEXT NOT NULL,
                profit TEXT NOT NULL,
                min TEXT NOT NULL,
                risk TEXT NOT NULL,
                duration TEXT DEFAULT '1 day',
                image TEXT,
                bonus REAL DEFAULT 0,
                date TEXT NOT NULL,
                expires TEXT NOT NULL
            )
        `);

        // Tasks table
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                bonus REAL NOT NULL,
                type TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                steps TEXT DEFAULT '[]',
                created TEXT NOT NULL,
                expires TEXT
            )
        `);

        // Daily Tasks
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS daily_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                bonus REAL NOT NULL,
                steps TEXT DEFAULT '[]',
                date TEXT NOT NULL,
                expires TEXT NOT NULL,
                status TEXT DEFAULT 'active'
            )
        `);

        // Settings table
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        // Investments table
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS investments (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                projectId INTEGER NOT NULL,
                projectTitle TEXT NOT NULL,
                amount REAL NOT NULL,
                invested REAL NOT NULL,
                withdrawn REAL DEFAULT 0,
                roi REAL NOT NULL,
                status TEXT DEFAULT 'active',
                date TEXT NOT NULL
            )
        `);

        // Feedback table
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                rating INTEGER DEFAULT 5,
                status TEXT DEFAULT 'pending',
                created TEXT NOT NULL
            )
        `);

        // Support Tickets
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                priority TEXT DEFAULT 'normal',
                created TEXT NOT NULL,
                updated TEXT NOT NULL
            )
        `);

        // Notifications
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT DEFAULT 'info',
                read INTEGER DEFAULT 0,
                created TEXT NOT NULL
            )
        `);

        // User Settings
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS user_settings (
                userId TEXT PRIMARY KEY,
                walletAddress TEXT,
                bankDetails TEXT,
                notificationEnabled INTEGER DEFAULT 1,
                twoFactorEnabled INTEGER DEFAULT 0,
                updated TEXT NOT NULL
            )
        `);

        // Withdrawals
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                userName TEXT NOT NULL,
                amount TEXT NOT NULL,
                method TEXT NOT NULL,
                address TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                date TEXT NOT NULL
            )
        `);

        console.log('✅ Database tables initialized');
        
        // Инициализируем дефолтные данные
        await initDefaultData();
        
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

// ================================================
// ДЕФОЛТНЫЕ ДАННЫЕ
// ================================================
async function initDefaultData() {
    try {
        // Проверяем админа
        const adminCheck = await turso.execute('SELECT * FROM users WHERE email = ?', ['attackavgustov@proton.me']);
        if (adminCheck.rows.length === 0) {
            const adminId = 'adm_' + Date.now();
            const hashedPassword = bcrypt.hashSync('l39503950l', 10);
            await turso.execute(`
                INSERT INTO users (id, name, email, password, role, status, created, refCode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [adminId, 'Administrator', 'attackavgustov@proton.me', hashedPassword, 'admin', 'active', new Date().toISOString(), 'ADMIN01']);
            console.log('✅ Admin user created');
        }

        // Дефолтные настройки
        const settingsCheck = await turso.execute('SELECT * FROM settings WHERE key = ?', ['ton']);
        if (settingsCheck.rows.length === 0) {
            const defaultSettings = [
                ['ton', 'UQBIN3fAThhmWe8m2_BM_pEA2PPrBN4r7_Oj16vN0rkfS94a'],
                ['usdt', 'TNp3epj1ReAxkHSXjpVwvDYP78i4cRbEAH'],
                ['bank', 'Bank: Raiffeisen Bank\nAccount: 123-456-789\nSWIFT: RAIFFEIS\nIBAN: RS12345678901234567890'],
                ['support_email', 'support@profithouse.com'],
                ['min_deposit', '12000'],
                ['max_deposit', '160000'],
                ['withdraw_fee', '12']
            ];
            for (const [key, value] of defaultSettings) {
                await turso.execute('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
            }
            console.log('✅ Default settings created');
        }

        // Дефолтные фонды
        const fundsCheck = await turso.execute('SELECT * FROM funds LIMIT 1');
        if (fundsCheck.rows.length === 0) {
            const defaultFunds = [
                ['fund_001', 'Hosting Fund', 12000, 2.0, 'Buy domain, renew SSL', 'active'],
                ['fund_002', 'Crypto Fund', 20000, 2.5, 'Confirm transactions, update wallets', 'active'],
                ['fund_003', 'Real Estate Fund', 30000, 3.0, 'Review offers, update prices', 'active']
            ];
            for (const [id, name, min, roi, task, status] of defaultFunds) {
                await turso.execute(`
                    INSERT INTO funds (id, name, min, roi, task, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [id, name, min, roi, task, status]);
            }
            console.log('✅ Default funds created');
        }

        // Дефолтные проекты
        const projectsCheck = await turso.execute('SELECT * FROM projects LIMIT 1');
        if (projectsCheck.rows.length === 0) {
            const defaultProjects = [
                ['Hosting Fund Pro', 'Premium hosting infrastructure with high returns. Level 1: 10% ROI.', '10% ROI', '12,000 RSD', 'Level 1', '14 days', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop', 'active'],
                ['Crypto Hosting', 'Crypto-optimized hosting with 25% ROI. Level 2: 25% ROI.', '25% ROI', '20,000 RSD', 'Level 2', '14 days', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop', 'active'],
                ['Real Estate Servers', 'Premium real estate server infrastructure. Level 3: 35% ROI.', '35% ROI', '30,000 RSD', 'Level 3', '14 days', 'https://images.unsplash.com/photo-1544198365-f5d60b6d8190?w=600&h=400&fit=crop', 'active'],
                ['AI Cloud Servers', 'Next-gen AI cloud infrastructure. Level 4: 40% ROI.', '40% ROI', '40,000 RSD', 'Level 4', '14 days', 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=400&fit=crop', 'active'],
                ['Green Energy Hosting', 'Sustainable hosting with 45% ROI. Level 5: 45% ROI.', '45% ROI', '50,000 RSD', 'Level 5', '14 days', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop', 'active'],
                ['Turbo Servers', 'High-performance turbo servers with 50% ROI. Level 6: 50% ROI.', '50% ROI', '60,000 RSD', 'Level 6', '14 days', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop', 'active']
            ];
            for (const [title, desc, profit, min, risk, duration, image, status] of defaultProjects) {
                await turso.execute(`
                    INSERT INTO projects (title, desc, profit, min, risk, duration, image, status, created, updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [title, desc, profit, min, risk, duration, image, status, new Date().toISOString(), new Date().toISOString()]);
            }
            console.log('✅ Default projects created');
        }

        // Дефолтные задачи
        const tasksCheck = await turso.execute('SELECT * FROM tasks LIMIT 1');
        if (tasksCheck.rows.length === 0) {
            const defaultTasks = [
                ['task1', 'Server Uptime Check', 'Verify all servers are online and responding', 0.5, 'daily', 'active', '["Log in to dashboard","Check server status","Report anomalies"]', new Date().toISOString(), null],
                ['task2', 'SSL Certificate Renewal', 'Check SSL certificates and renew if needed', 1.0, 'weekly', 'active', '["List SSL certificates","Check expiration dates","Renew if needed"]', new Date().toISOString(), null],
                ['task3', 'Security Audit Review', 'Review security logs for suspicious activity', 2.0, 'special', 'active', '["Access security logs","Review failed attempts","Report findings"]', new Date().toISOString(), null]
            ];
            for (const [id, title, desc, bonus, type, status, steps, created, expires] of defaultTasks) {
                await turso.execute(`
                    INSERT INTO tasks (id, title, description, bonus, type, status, steps, created, expires)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [id, title, desc, bonus, type, status, steps, created, expires]);
            }
            console.log('✅ Default tasks created');
        }

        // Генерируем ежедневные проекты и задачи
        await generateDailyProjects();
        await generateDailyTasks();

    } catch (error) {
        console.error('❌ Default data initialization error:', error);
    }
}

// ================================================
// ДНЕВНЫЕ ПРОЕКТЫ И ЗАДАЧИ
// ================================================
function getToday() {
    return new Date().toISOString().split('T')[0];
}

function getTomorrow() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
}

async function generateDailyProjects() {
    try {
        const today = getToday();
        const tomorrow = getTomorrow();

        // Удаляем старые
        await turso.execute('DELETE FROM daily_projects WHERE date < ?', [today]);

        const existing = await turso.execute('SELECT * FROM daily_projects WHERE date = ?', [today]);
        if (existing.rows.length === 0) {
            const dailyProjects = [
                ['🚀 Daily Boost Fund', 'Special daily investment with bonus returns!', '15% ROI', '12,000 RSD', 'Level 1', '1 day', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop', 2.0, today, tomorrow],
                ['⚡ Flash Investment', 'Limited time daily offer. High returns!', '25% ROI', '20,000 RSD', 'Level 2', '1 day', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop', 3.0, today, tomorrow],
                ['🌟 Daily Premium', 'Premium daily investment with guaranteed returns.', '35% ROI', '30,000 RSD', 'Level 3', '1 day', 'https://images.unsplash.com/photo-1544198365-f5d60b6d8190?w=600&h=400&fit=crop', 4.0, today, tomorrow]
            ];
            for (const [title, desc, profit, min, risk, duration, image, bonus, date, expires] of dailyProjects) {
                await turso.execute(`
                    INSERT INTO daily_projects (title, desc, profit, min, risk, duration, image, bonus, date, expires)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [title, desc, profit, min, risk, duration, image, bonus, date, expires]);
            }
            console.log('✅ Daily projects generated for', today);
        }
    } catch (error) {
        console.error('❌ Error generating daily projects:', error);
    }
}

async function generateDailyTasks() {
    try {
        const today = getToday();
        const tomorrow = getTomorrow();

        await turso.execute('DELETE FROM daily_tasks WHERE date < ?', [today]);

        const existing = await turso.execute('SELECT * FROM daily_tasks WHERE date = ?', [today]);
        if (existing.rows.length === 0) {
            const dailyTasks = [
                ['📊 Daily Server Check', 'Verify server status and report issues.', 1.0, '["Log in to dashboard","Check all server status indicators","Report anomalies"]', today, tomorrow, 'active'],
                ['🔐 Security Scan', 'Perform a security scan and review logs.', 1.5, '["Access security logs","Review failed attempts","Report findings"]', today, tomorrow, 'active'],
                ['💾 Backup Verification', 'Verify daily backups are running correctly.', 1.0, '["Check backup schedule","Verify backup sizes","Test restore"]', today, tomorrow, 'active'],
                ['🌐 DNS Record Check', 'Verify all DNS records are correct.', 0.8, '["Check DNS zone files","Verify A,CNAME,MX records","Update outdated records"]', today, tomorrow, 'active']
            ];
            for (const [title, desc, bonus, steps, date, expires, status] of dailyTasks) {
                await turso.execute(`
                    INSERT INTO daily_tasks (title, description, bonus, steps, date, expires, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [title, desc, bonus, steps, date, expires, status]);
            }
            console.log('✅ Daily tasks generated for', today);
        }
    } catch (error) {
        console.error('❌ Error generating daily tasks:', error);
    }
}

// ================================================
// CRON ЗАДАЧИ (ежедневное обновление в полночь)
// ================================================
cron.schedule('0 0 * * *', () => {
    console.log('🔄 Running daily update at', new Date().toISOString());
    generateDailyProjects();
    generateDailyTasks();
});

// ================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ================================================
function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
}

function generateRefCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateTxId() {
    return 'TX' + Date.now() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        req.userRole = decoded.role || 'user';
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// ================================================
// API ЭНДПОИНТЫ
// ================================================

// ============ HEALTH ============
app.get('/api/health', async (req, res) => {
    try {
        const result = await turso.execute('SELECT 1');
        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '2.0.0'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            error: error.message
        });
    }
});

// ============ AUTH ============
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, referralCode } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const existingUser = await turso.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const userId = generateId();
        const refCode = generateRefCode();
        const hashedPassword = bcrypt.hashSync(password, 10);
        const created = new Date().toISOString();

        await turso.execute(`
            INSERT INTO users (id, name, email, password, role, status, created, refCode, referredBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, name, email, hashedPassword, 'user', 'active', created, refCode, referralCode || null]);

        // Реферальный бонус
        if (referralCode) {
            const referrer = await turso.execute('SELECT * FROM users WHERE refCode = ?', [referralCode]);
            if (referrer.rows.length > 0) {
                const referrerUser = referrer.rows[0];
                const bonus = 1000;
                await turso.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [bonus, referrerUser.id]);
                await turso.execute(`
                    INSERT INTO transactions (id, userId, type, amount, method, status, date)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [generateTxId(), referrerUser.id, 'referral_bonus', bonus + ' RSD', 'Referral ' + referralCode, 'approved', new Date().toISOString()]);
                
                // Уведомление рефереру
                await turso.execute(`
                    INSERT INTO notifications (userId, title, message, type, created)
                    VALUES (?, ?, ?, ?, ?)
                `, [referrerUser.id, '🎉 New Referral!', `${name} joined using your referral link. You earned 1000 RSD bonus!`, 'success', new Date().toISOString()]);
            }
        }

        // Создаем настройки пользователя
        await turso.execute(`
            INSERT INTO user_settings (userId, walletAddress, bankDetails, notificationEnabled, twoFactorEnabled, updated)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, '', '', 1, 0, new Date().toISOString()]);

        // Уведомление новому пользователю
        await turso.execute(`
            INSERT INTO notifications (userId, title, message, type, created)
            VALUES (?, ?, ?, ?, ?)
        `, [userId, '👋 Welcome to Profit House!', 'Start your investment journey today. Check out our daily projects and tasks to earn passive income.', 'info', new Date().toISOString()]);

        const token = jwt.sign({ id: userId, email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
        const user = { id: userId, name, email, role: 'user', balance: 0, totalInvested: 0, refCode };

        res.json({ success: true, token, user });
    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await turso.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        if (user.status === 'blocked') {
            return res.status(403).json({ error: 'Account blocked' });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                balance: user.balance || 0,
                totalInvested: user.totalInvested || 0,
                refCode: user.refCode,
                status: user.status
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/verify', authenticate, async (req, res) => {
    try {
        const result = await turso.execute(
            'SELECT id, name, email, role, balance, totalInvested, refCode, status FROM users WHERE id = ?',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('❌ Verify error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ============ USERS ============
app.get('/api/users', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const result = await turso.execute(
            'SELECT id, name, email, role, status, created, balance, totalInvested, refCode FROM users'
        );

        res.json({ success: true, users: result.rows });
    } catch (error) {
        console.error('❌ Users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

app.put('/api/users/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { balance, status } = req.body;
        const userId = req.params.id;

        let query = 'UPDATE users SET ';
        const params = [];
        if (balance !== undefined) { query += 'balance = ?, '; params.push(balance); }
        if (status !== undefined) { query += 'status = ?, '; params.push(status); }
        query = query.slice(0, -2) + ' WHERE id = ?';
        params.push(userId);

        await turso.execute(query, params);

        // Если изменили баланс, добавляем транзакцию
        if (balance !== undefined) {
            await turso.execute(`
                INSERT INTO transactions (id, userId, type, amount, method, status, date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [generateTxId(), userId, 'admin_adjustment', balance + ' RSD', 'Admin', 'approved', new Date().toISOString()]);
        }

        res.json({ success: true, message: 'User updated' });
    } catch (error) {
        console.error('❌ Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ============ USER SETTINGS ============
app.get('/api/user/settings', authenticate, async (req, res) => {
    try {
        const result = await turso.execute('SELECT * FROM user_settings WHERE userId = ?', [req.userId]);
        if (result.rows.length === 0) {
            await turso.execute(`
                INSERT INTO user_settings (userId, walletAddress, bankDetails, notificationEnabled, twoFactorEnabled, updated)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [req.userId, '', '', 1, 0, new Date().toISOString()]);
            const newResult = await turso.execute('SELECT * FROM user_settings WHERE userId = ?', [req.userId]);
            return res.json({ success: true, settings: newResult.rows[0] });
        }
        res.json({ success: true, settings: result.rows[0] });
    } catch (error) {
        console.error('❌ Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

app.put('/api/user/settings', authenticate, async (req, res) => {
    try {
        const { walletAddress, bankDetails, notificationEnabled, twoFactorEnabled } = req.body;

        await turso.execute(`
            UPDATE user_settings 
            SET walletAddress = ?, bankDetails = ?, notificationEnabled = ?, twoFactorEnabled = ?, updated = ?
            WHERE userId = ?
        `, [walletAddress || '', bankDetails || '', notificationEnabled !== undefined ? notificationEnabled : 1, 
            twoFactorEnabled !== undefined ? twoFactorEnabled : 0, new Date().toISOString(), req.userId]);

        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        console.error('❌ Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ============ REFERRALS ============
app.get('/api/users/:userId/referrals', authenticate, async (req, res) => {
    try {
        const userId = req.params.userId;

        const userResult = await turso.execute('SELECT refCode FROM users WHERE id = ?', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const refCode = userResult.rows[0].refCode;

        const directResult = await turso.execute('SELECT * FROM users WHERE referredBy = ?', [refCode]);
        const direct = directResult.rows;

        let level2 = [];
        let level3 = [];

        for (const ref of direct) {
            const l2 = await turso.execute('SELECT * FROM users WHERE referredBy = ?', [ref.refCode]);
            level2 = [...level2, ...l2.rows];
        }

        for (const ref of level2) {
            const l3 = await turso.execute('SELECT * FROM users WHERE referredBy = ?', [ref.refCode]);
            level3 = [...level3, ...l3.rows];
        }

        res.json({
            success: true,
            direct: direct.length,
            level2: level2.length,
            level3: level3.length,
            referrals: direct
        });
    } catch (error) {
        console.error('❌ Referrals error:', error);
        res.status(500).json({ error: 'Failed to get referrals' });
    }
});

// ============ TRANSACTIONS ============
app.get('/api/transactions', authenticate, async (req, res) => {
    try {
        const result = await turso.execute(
            'SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC',
            [req.userId]
        );

        res.json({ success: true, transactions: result.rows });
    } catch (error) {
        console.error('❌ Transactions error:', error);
        res.status(500).json({ error: 'Failed to get transactions' });
    }
});

app.post('/api/transactions', authenticate, async (req, res) => {
    try {
        const { type, amount, method, status } = req.body;
        const id = generateTxId();
        const date = new Date().toISOString();

        await turso.execute(`
            INSERT INTO transactions (id, userId, type, amount, method, status, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, req.userId, type, amount, method, status || 'pending', date]);

        res.json({
            success: true,
            transaction: { id, userId: req.userId, type, amount, method, status: status || 'pending', date }
        });
    } catch (error) {
        console.error('❌ Create transaction error:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

// ============ INVESTMENTS ============
app.get('/api/investments', authenticate, async (req, res) => {
    try {
        const result = await turso.execute(
            'SELECT * FROM investments WHERE userId = ? ORDER BY date DESC',
            [req.userId]
        );

        res.json({ success: true, investments: result.rows });
    } catch (error) {
        console.error('❌ Investments error:', error);
        res.status(500).json({ error: 'Failed to get investments' });
    }
});

app.post('/api/investments', authenticate, async (req, res) => {
    try {
        const { projectId, projectTitle, amount, roi } = req.body;
        const id = 'inv_' + Date.now();
        const date = new Date().toISOString();

        await turso.execute(`
            INSERT INTO investments (id, userId, projectId, projectTitle, amount, invested, withdrawn, roi, status, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, req.userId, projectId, projectTitle, amount, amount, 0, roi, 'active', date]);

        res.json({
            success: true,
            investment: { id, userId: req.userId, projectId, projectTitle, amount, invested: amount, withdrawn: 0, roi, status: 'active', date }
        });
    } catch (error) {
        console.error('❌ Create investment error:', error);
        res.status(500).json({ error: 'Failed to create investment' });
    }
});

// ============ FEEDBACK ============
app.post('/api/feedback', authenticate, async (req, res) => {
    try {
        const { message, rating } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const userResult = await turso.execute('SELECT name, email FROM users WHERE id = ?', [req.userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        await turso.execute(`
            INSERT INTO feedback (userId, name, email, message, rating, status, created)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [req.userId, user.name, user.email, message, rating || 5, 'pending', new Date().toISOString()]);

        // Уведомление администратору
        const adminResult = await turso.execute('SELECT id FROM users WHERE role = ?', ['admin']);
        if (adminResult.rows.length > 0) {
            const admin = adminResult.rows[0];
            await turso.execute(`
                INSERT INTO notifications (userId, title, message, type, created)
                VALUES (?, ?, ?, ?, ?)
            `, [admin.id, '📩 New Feedback', `${user.name} sent new feedback: "${message.substring(0, 50)}..."`, 'info', new Date().toISOString()]);
        }

        res.json({ success: true, message: 'Feedback submitted successfully' });
    } catch (error) {
        console.error('❌ Feedback error:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

app.get('/api/feedback', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const result = await turso.execute('SELECT * FROM feedback ORDER BY created DESC');
        res.json({ success: true, feedback: result.rows });
    } catch (error) {
        console.error('❌ Get feedback error:', error);
        res.status(500).json({ error: 'Failed to get feedback' });
    }
});

app.put('/api/feedback/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { status } = req.body;
        await turso.execute('UPDATE feedback SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: 'Feedback updated' });
    } catch (error) {
        console.error('❌ Update feedback error:', error);
        res.status(500).json({ error: 'Failed to update feedback' });
    }
});

// ============ SUPPORT TICKETS ============
app.post('/api/support', authenticate, async (req, res) => {
    try {
        const { subject, message, priority } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }

        await turso.execute(`
            INSERT INTO support_tickets (userId, subject, message, status, priority, created, updated)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [req.userId, subject, message, 'open', priority || 'normal', new Date().toISOString(), new Date().toISOString()]);

        // Уведомление администратору
        const adminResult = await turso.execute('SELECT id FROM users WHERE role = ?', ['admin']);
        if (adminResult.rows.length > 0) {
            const admin = adminResult.rows[0];
            await turso.execute(`
                INSERT INTO notifications (userId, title, message, type, created)
                VALUES (?, ?, ?, ?, ?)
            `, [admin.id, '🎫 New Support Ticket', `New ticket: "${subject}"`, 'info', new Date().toISOString()]);
        }

        res.json({ success: true, message: 'Ticket created successfully' });
    } catch (error) {
        console.error('❌ Support ticket error:', error);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
});

app.get('/api/support', authenticate, async (req, res) => {
    try {
        let result;
        if (req.userRole === 'admin') {
            result = await turso.execute('SELECT * FROM support_tickets ORDER BY created DESC');
        } else {
            result = await turso.execute('SELECT * FROM support_tickets WHERE userId = ? ORDER BY created DESC', [req.userId]);
        }
        res.json({ success: true, tickets: result.rows });
    } catch (error) {
        console.error('❌ Get tickets error:', error);
        res.status(500).json({ error: 'Failed to get tickets' });
    }
});

app.put('/api/support/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { status, priority } = req.body;
        await turso.execute(`
            UPDATE support_tickets SET status = ?, priority = ?, updated = ?
            WHERE id = ?
        `, [status || 'open', priority || 'normal', new Date().toISOString(), req.params.id]);

        res.json({ success: true, message: 'Ticket updated' });
    } catch (error) {
        console.error('❌ Update ticket error:', error);
        res.status(500).json({ error: 'Failed to update ticket' });
    }
});

// ============ NOTIFICATIONS ============
app.get('/api/notifications', authenticate, async (req, res) => {
    try {
        const result = await turso.execute(
            'SELECT * FROM notifications WHERE userId = ? ORDER BY created DESC LIMIT 50',
            [req.userId]
        );
        res.json({ success: true, notifications: result.rows });
    } catch (error) {
        console.error('❌ Get notifications error:', error);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
    try {
        await turso.execute('UPDATE notifications SET read = 1 WHERE id = ? AND userId = ?', [req.params.id, req.userId]);
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('❌ Mark notification read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

app.put('/api/notifications/read-all', authenticate, async (req, res) => {
    try {
        await turso.execute('UPDATE notifications SET read = 1 WHERE userId = ?', [req.userId]);
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('❌ Mark all notifications read error:', error);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// ============ PROJECTS ============
app.get('/api/projects', async (req, res) => {
    try {
        const result = await turso.execute('SELECT * FROM projects WHERE status = ? ORDER BY created DESC', ['active']);
        res.json({ success: true, projects: result.rows });
    } catch (error) {
        console.error('❌ Projects error:', error);
        res.status(500).json({ error: 'Failed to get projects' });
    }
});

app.post('/api/projects', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { title, desc, profit, min, risk, duration, image, status } = req.body;
        if (!title || !desc || !profit || !min || !risk) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        await turso.execute(`
            INSERT INTO projects (title, desc, profit, min, risk, duration, image, status, created, updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [title, desc, profit, min, risk, duration || '14 days', image || '', status || 'active', new Date().toISOString(), new Date().toISOString()]);

        res.json({ success: true, message: 'Project created' });
    } catch (error) {
        console.error('❌ Create project error:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

app.put('/api/projects/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { title, desc, profit, min, risk, duration, image, status } = req.body;
        await turso.execute(`
            UPDATE projects 
            SET title = ?, desc = ?, profit = ?, min = ?, risk = ?, duration = ?, image = ?, status = ?, updated = ?
            WHERE id = ?
        `, [title, desc, profit, min, risk, duration, image, status, new Date().toISOString(), req.params.id]);

        res.json({ success: true, message: 'Project updated' });
    } catch (error) {
        console.error('❌ Update project error:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

app.delete('/api/projects/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await turso.execute('DELETE FROM projects WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Project deleted' });
    } catch (error) {
        console.error('❌ Delete project error:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// ============ DAILY PROJECTS ============
app.get('/api/daily-projects', async (req, res) => {
    try {
        const today = getToday();
        const result = await turso.execute('SELECT * FROM daily_projects WHERE date = ? AND expires > ?', [today, today]);
        res.json({ success: true, projects: result.rows });
    } catch (error) {
        console.error('❌ Daily projects error:', error);
        res.status(500).json({ error: 'Failed to get daily projects' });
    }
});

// ============ TASKS ============
app.get('/api/tasks', async (req, res) => {
    try {
        const result = await turso.execute('SELECT * FROM tasks WHERE status = ?', ['active']);
        const tasks = result.rows.map(t => {
            try { t.steps = JSON.parse(t.steps); } catch (e) { t.steps = []; }
            return t;
        });
        res.json({ success: true, tasks });
    } catch (error) {
        console.error('❌ Tasks error:', error);
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

app.post('/api/tasks', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { title, description, bonus, type, steps, expires } = req.body;
        if (!title || !description || !bonus || !type) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const id = 'task_' + Date.now();
        await turso.execute(`
            INSERT INTO tasks (id, title, description, bonus, type, status, steps, created, expires)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, title, description, bonus, type, 'active', JSON.stringify(steps || []), new Date().toISOString(), expires || null]);

        res.json({ success: true, message: 'Task created' });
    } catch (error) {
        console.error('❌ Create task error:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

app.put('/api/tasks/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { title, description, bonus, type, status, steps, expires } = req.body;
        await turso.execute(`
            UPDATE tasks 
            SET title = ?, description = ?, bonus = ?, type = ?, status = ?, steps = ?, expires = ?
            WHERE id = ?
        `, [title, description, bonus, type, status, JSON.stringify(steps || []), expires || null, req.params.id]);

        res.json({ success: true, message: 'Task updated' });
    } catch (error) {
        console.error('❌ Update task error:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

app.delete('/api/tasks/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await turso.execute('DELETE FROM tasks WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Task deleted' });
    } catch (error) {
        console.error('❌ Delete task error:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ============ DAILY TASKS ============
app.get('/api/daily-tasks', async (req, res) => {
    try {
        const today = getToday();
        const result = await turso.execute('SELECT * FROM daily_tasks WHERE date = ? AND expires > ? AND status = ?', [today, today, 'active']);
        const tasks = result.rows.map(t => {
            try { t.steps = JSON.parse(t.steps); } catch (e) { t.steps = []; }
            return t;
        });
        res.json({ success: true, tasks });
    } catch (error) {
        console.error('❌ Daily tasks error:', error);
        res.status(500).json({ error: 'Failed to get daily tasks' });
    }
});

app.post('/api/daily-tasks/complete', authenticate, async (req, res) => {
    try {
        const { taskId } = req.body;
        const today = getToday();

        const userResult = await turso.execute('SELECT taskCompleted, dailyTasksCompleted, lastTaskDate, totalInvested FROM users WHERE id = ?', [req.userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        let taskCompleted = {};
        try {
            taskCompleted = JSON.parse(user.taskCompleted || '{}');
        } catch (e) {
            taskCompleted = {};
        }

        const taskKey = today + '_' + taskId;
        if (taskCompleted[taskKey]) {
            return res.status(400).json({ error: 'Task already completed today' });
        }

        const taskResult = await turso.execute('SELECT * FROM daily_tasks WHERE id = ? AND date = ?', [taskId, today]);
        if (taskResult.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const task = taskResult.rows[0];

        // Отмечаем задание как выполненное
        taskCompleted[taskKey] = true;
        await turso.execute('UPDATE users SET taskCompleted = ?, dailyTasksCompleted = dailyTasksCompleted + 1, lastTaskDate = ? WHERE id = ?', 
            [JSON.stringify(taskCompleted), today, req.userId]);

        let bonusAmount = 0;
        if (task.bonus > 0) {
            const totalInvested = user.totalInvested || 1000;
            bonusAmount = totalInvested * (task.bonus / 100);
            if (bonusAmount > 0) {
                await turso.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [bonusAmount, req.userId]);
                await turso.execute(`
                    INSERT INTO transactions (id, userId, type, amount, method, status, date)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [generateTxId(), req.userId, 'task_bonus', bonusAmount.toFixed(2) + ' RSD', 'Daily Task: ' + task.title, 'approved', new Date().toISOString()]);
            }
        }

        res.json({ 
            success: true, 
            message: 'Task completed successfully',
            bonus: task.bonus,
            bonusAmount: bonusAmount
        });
    } catch (error) {
        console.error('❌ Complete daily task error:', error);
        res.status(500).json({ error: 'Failed to complete task' });
    }
});

// ============ FUNDS ============
app.get('/api/funds', async (req, res) => {
    try {
        const result = await turso.execute('SELECT * FROM funds');
        res.json({ success: true, funds: result.rows });
    } catch (error) {
        console.error('❌ Funds error:', error);
        res.status(500).json({ error: 'Failed to get funds' });
    }
});

app.post('/api/funds', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { name, min, roi, task, status } = req.body;
        if (!name || !min || !roi || !task) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const id = 'fund_' + Date.now();
        await turso.execute(`
            INSERT INTO funds (id, name, min, roi, task, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [id, name, min, roi, task, status || 'active']);

        res.json({ success: true, message: 'Fund created' });
    } catch (error) {
        console.error('❌ Create fund error:', error);
        res.status(500).json({ error: 'Failed to create fund' });
    }
});

app.put('/api/funds/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { name, min, roi, task, status } = req.body;
        await turso.execute(`
            UPDATE funds SET name = ?, min = ?, roi = ?, task = ?, status = ?
            WHERE id = ?
        `, [name, min, roi, task, status, req.params.id]);

        res.json({ success: true, message: 'Fund updated' });
    } catch (error) {
        console.error('❌ Update fund error:', error);
        res.status(500).json({ error: 'Failed to update fund' });
    }
});

app.delete('/api/funds/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await turso.execute('DELETE FROM funds WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Fund deleted' });
    } catch (error) {
        console.error('❌ Delete fund error:', error);
        res.status(500).json({ error: 'Failed to delete fund' });
    }
});

// ============ SETTINGS ============
app.get('/api/settings', async (req, res) => {
    try {
        const result = await turso.execute('SELECT * FROM settings');
        const settings = {};
        result.rows.forEach(s => settings[s.key] = s.value);
        res.json({ success: true, settings });
    } catch (error) {
        console.error('❌ Settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

app.put('/api/settings', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { key, value } = req.body;
        await turso.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
        res.json({ success: true, message: 'Setting updated' });
    } catch (error) {
        console.error('❌ Update setting error:', error);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

// ============ WITHDRAWALS ============
app.post('/api/withdrawals', authenticate, async (req, res) => {
    try {
        const { amount, method, address } = req.body;
        const id = 'WD' + Date.now();
        const date = new Date().toISOString();

        const userResult = await turso.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
        const userName = userResult.rows.length > 0 ? userResult.rows[0].name : 'Unknown';

        await turso.execute(`
            INSERT INTO withdrawals (id, userId, userName, amount, method, address, status, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, req.userId, userName, amount, method, address, 'pending', date]);

        // Уведомление администратору
        const adminResult = await turso.execute('SELECT id FROM users WHERE role = ?', ['admin']);
        if (adminResult.rows.length > 0) {
            const admin = adminResult.rows[0];
            await turso.execute(`
                INSERT INTO notifications (userId, title, message, type, created)
                VALUES (?, ?, ?, ?, ?)
            `, [admin.id, '💰 New Withdrawal Request', `${userName} requested withdrawal of ${amount}`, 'info', new Date().toISOString()]);
        }

        res.json({ success: true, message: 'Withdrawal request submitted' });
    } catch (error) {
        console.error('❌ Withdrawal error:', error);
        res.status(500).json({ error: 'Failed to create withdrawal' });
    }
});

app.get('/api/withdrawals', authenticate, async (req, res) => {
    try {
        let result;
        if (req.userRole === 'admin') {
            result = await turso.execute('SELECT * FROM withdrawals ORDER BY date DESC');
        } else {
            result = await turso.execute('SELECT * FROM withdrawals WHERE userId = ? ORDER BY date DESC', [req.userId]);
        }
        res.json({ success: true, withdrawals: result.rows });
    } catch (error) {
        console.error('❌ Get withdrawals error:', error);
        res.status(500).json({ error: 'Failed to get withdrawals' });
    }
});

app.put('/api/withdrawals/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { status } = req.body;
        await turso.execute('UPDATE withdrawals SET status = ? WHERE id = ?', [status, req.params.id]);

        // Уведомление пользователю
        const wdResult = await turso.execute('SELECT userId, amount FROM withdrawals WHERE id = ?', [req.params.id]);
        if (wdResult.rows.length > 0) {
            const wd = wdResult.rows[0];
            await turso.execute(`
                INSERT INTO notifications (userId, title, message, type, created)
                VALUES (?, ?, ?, ?, ?)
            `, [wd.userId, `💰 Withdrawal ${status}`, `Your withdrawal of ${wd.amount} has been ${status}`, status === 'approved' ? 'success' : 'info', new Date().toISOString()]);
        }

        res.json({ success: true, message: 'Withdrawal updated' });
    } catch (error) {
        console.error('❌ Update withdrawal error:', error);
        res.status(500).json({ error: 'Failed to update withdrawal' });
    }
});

// ============ SYNC ============
app.get('/api/sync', authenticate, async (req, res) => {
    try {
        const [users, transactions, funds, projects, tasks, dailyProjects, dailyTasks, settingsRows, feedback, support, withdrawals, notifications] = await Promise.all([
            turso.execute('SELECT id, name, email, role, status, created, balance, totalInvested, refCode, referredBy, dailyTasksCompleted, lastTaskDate FROM users'),
            turso.execute('SELECT * FROM transactions ORDER BY date DESC LIMIT 100'),
            turso.execute('SELECT * FROM funds'),
            turso.execute('SELECT * FROM projects WHERE status = ?', ['active']),
            turso.execute('SELECT * FROM tasks WHERE status = ?', ['active']),
            turso.execute('SELECT * FROM daily_projects WHERE date = ?', [getToday()]),
            turso.execute('SELECT * FROM daily_tasks WHERE date = ? AND status = ?', [getToday(), 'active']),
            turso.execute('SELECT * FROM settings'),
            turso.execute('SELECT * FROM feedback WHERE status = ? ORDER BY created DESC LIMIT 50', ['pending']),
            turso.execute('SELECT * FROM support_tickets WHERE status != ? ORDER BY created DESC LIMIT 50', ['closed']),
            turso.execute('SELECT * FROM withdrawals WHERE status = ? ORDER BY date DESC', ['pending']),
            turso.execute('SELECT * FROM notifications WHERE userId = ? ORDER BY created DESC LIMIT 20', [req.userId])
        ]);

        const settings = {};
        settingsRows.rows.forEach(s => settings[s.key] = s.value);

        const tasksParsed = tasks.rows.map(t => {
            try { t.steps = JSON.parse(t.steps); } catch (e) { t.steps = []; }
            return t;
        });

        const dailyTasksParsed = dailyTasks.rows.map(t => {
            try { t.steps = JSON.parse(t.steps); } catch (e) { t.steps = []; }
            return t;
        });

        res.json({
            success: true,
            data: { 
                users: users.rows, 
                transactions: transactions.rows, 
                funds: funds.rows, 
                projects: projects.rows, 
                tasks: tasksParsed,
                dailyProjects: dailyProjects.rows,
                dailyTasks: dailyTasksParsed,
                settings,
                feedback: feedback.rows,
                support: support.rows,
                withdrawals: withdrawals.rows,
                notifications: notifications.rows
            }
        });
    } catch (error) {
        console.error('❌ Sync error:', error);
        res.status(500).json({ error: 'Sync failed: ' + error.message });
    }
});

app.post('/api/sync', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const data = req.body.data;
        if (!data) {
            return res.status(400).json({ error: 'No data provided' });
        }

        // Сохраняем фонды
        if (data.funds) {
            for (const fund of data.funds) {
                await turso.execute(`
                    INSERT OR REPLACE INTO funds (id, name, min, roi, task, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [fund.id, fund.name, fund.min, fund.roi, fund.task, fund.status]);
            }
        }

        // Сохраняем проекты
        if (data.projects) {
            for (const project of data.projects) {
                await turso.execute(`
                    INSERT OR REPLACE INTO projects (id, title, desc, profit, min, risk, duration, image, status, created, updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [project.id, project.title, project.desc, project.profit, project.min, project.risk, project.duration || '14 days', project.image, project.status || 'active', project.created || new Date().toISOString(), new Date().toISOString()]);
            }
        }

        // Сохраняем задачи
        if (data.tasks) {
            for (const task of data.tasks) {
                await turso.execute(`
                    INSERT OR REPLACE INTO tasks (id, title, description, bonus, type, status, steps, created, expires)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [task.id, task.title, task.description, task.bonus, task.type, task.status, JSON.stringify(task.steps || []), task.created || new Date().toISOString(), task.expires || null]);
            }
        }

        // Сохраняем настройки
        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                await turso.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
            }
        }

        res.json({ success: true, message: 'Data synced successfully' });
    } catch (error) {
        console.error('❌ Sync error:', error);
        res.status(500).json({ error: 'Sync failed: ' + error.message });
    }
});

// ============ ROOT ============
app.get('/', (req, res) => {
    res.json({
        name: 'Profit House API',
        version: '2.0.0',
        status: 'running',
        database: 'Turso DB',
        endpoints: {
            auth: '/api/login, /api/register, /api/verify',
            users: '/api/users, /api/users/:id',
            referrals: '/api/users/:userId/referrals',
            transactions: '/api/transactions',
            investments: '/api/investments',
            funds: '/api/funds',
            projects: '/api/projects',
            dailyProjects: '/api/daily-projects',
            tasks: '/api/tasks',
            dailyTasks: '/api/daily-tasks',
            feedback: '/api/feedback',
            support: '/api/support',
            notifications: '/api/notifications',
            withdrawals: '/api/withdrawals',
            settings: '/api/settings',
            sync: '/api/sync',
            health: '/api/health'
        }
    });
});

// ================================================
// ЗАПУСК СЕРВЕРА
// ================================================
async function startServer() {
    try {
        await initDatabase();
        
        // Запускаем ежедневную генерацию сразу
        await generateDailyProjects();
        await generateDailyTasks();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 Server running on port ${PORT}`);
            console.log(`🔑 Admin: attackavgustov@proton.me / l39503950l`);
            console.log(`🌐 API: http://localhost:${PORT}/api`);
            console.log(`🗄️  Database: Turso DB`);
            console.log(`📊 Health: http://localhost:${PORT}/api/health`);
            console.log(`🔄 Daily updates scheduled for midnight\n`);
        });
    } catch (error) {
        console.error('❌ Server startup error:', error);
        process.exit(1);
    }
}

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
