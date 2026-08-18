const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@libsql/client');
const cron = require('node-cron');
const dotenv = require('dotenv');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

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
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

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
                lastTaskDate TEXT,
                telegramId TEXT,
                phone TEXT,
                country TEXT,
                lastLogin TEXT,
                loginCount INTEGER DEFAULT 0
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
                date TEXT NOT NULL,
                description TEXT,
                adminNote TEXT
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
                status TEXT DEFAULT 'active',
                created TEXT NOT NULL,
                updated TEXT NOT NULL
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
                updated TEXT NOT NULL,
                category TEXT DEFAULT 'hosting',
                totalInvested REAL DEFAULT 0,
                totalInvestors INTEGER DEFAULT 0
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
                expires TEXT NOT NULL,
                totalInvested REAL DEFAULT 0
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
                expires TEXT,
                completedCount INTEGER DEFAULT 0
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
                status TEXT DEFAULT 'active',
                completedCount INTEGER DEFAULT 0
            )
        `);

        // Settings table
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated TEXT NOT NULL
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
                date TEXT NOT NULL,
                lastPayout TEXT,
                totalPayouts REAL DEFAULT 0
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
                created TEXT NOT NULL,
                response TEXT,
                respondedAt TEXT,
                respondedBy TEXT
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
                updated TEXT NOT NULL,
                assignedTo TEXT,
                resolution TEXT,
                closedAt TEXT
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
                created TEXT NOT NULL,
                actionUrl TEXT,
                icon TEXT DEFAULT 'bell'
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
                updated TEXT NOT NULL,
                language TEXT DEFAULT 'en',
                theme TEXT DEFAULT 'light'
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
                date TEXT NOT NULL,
                processedAt TEXT,
                adminNote TEXT,
                transactionId TEXT
            )
        `);

        // News/Blog
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                image TEXT,
                category TEXT DEFAULT 'general',
                status TEXT DEFAULT 'published',
                created TEXT NOT NULL,
                updated TEXT NOT NULL,
                views INTEGER DEFAULT 0
            )
        `);

        // Affiliate/Referral Earnings
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS referral_earnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrerId TEXT NOT NULL,
                referredId TEXT NOT NULL,
                amount REAL NOT NULL,
                level INTEGER DEFAULT 1,
                status TEXT DEFAULT 'pending',
                created TEXT NOT NULL,
                paidAt TEXT
            )
        `);

        // Login History
        await turso.execute(`
            CREATE TABLE IF NOT EXISTS login_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                ip TEXT,
                userAgent TEXT,
                location TEXT,
                created TEXT NOT NULL
            )
        `);

        console.log('✅ Database tables initialized');
        
        await initDefaultData();
        await generateDailyProjects();
        await generateDailyTasks();
        
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
                ['ton', 'UQBIN3fAThhmWe8m2_BM_pEA2PPrBN4r7_Oj16vN0rkfS94a', new Date().toISOString()],
                ['usdt', 'TNp3epj1ReAxkHSXjpVwvDYP78i4cRbEAH', new Date().toISOString()],
                ['bank', 'Bank: Raiffeisen Bank\nAccount: 123-456-789\nSWIFT: RAIFFEIS\nIBAN: RS12345678901234567890', new Date().toISOString()],
                ['support_email', 'support@profithouse.com', new Date().toISOString()],
                ['min_deposit', '12000', new Date().toISOString()],
                ['max_deposit', '160000', new Date().toISOString()],
                ['withdraw_fee', '12', new Date().toISOString()],
                ['referral_bonus_level1', '20', new Date().toISOString()],
                ['referral_bonus_level2', '5', new Date().toISOString()],
                ['referral_bonus_level3', '1', new Date().toISOString()],
                ['maintenance_mode', 'false', new Date().toISOString()],
                ['site_title', 'Profit House', new Date().toISOString()],
                ['site_description', 'Premium Investment Platform', new Date().toISOString()]
            ];
            for (const [key, value, updated] of defaultSettings) {
                await turso.execute('INSERT INTO settings (key, value, updated) VALUES (?, ?, ?)', [key, value, updated]);
            }
            console.log('✅ Default settings created');
        }

        // Дефолтные фонды
        const fundsCheck = await turso.execute('SELECT * FROM funds LIMIT 1');
        if (fundsCheck.rows.length === 0) {
            const defaultFunds = [
                ['fund_001', 'Hosting Fund', 12000, 2.0, 'Buy domain, renew SSL', 'active', new Date().toISOString(), new Date().toISOString()],
                ['fund_002', 'Crypto Fund', 20000, 2.5, 'Confirm transactions, update wallets', 'active', new Date().toISOString(), new Date().toISOString()],
                ['fund_003', 'Real Estate Fund', 30000, 3.0, 'Review offers, update prices', 'active', new Date().toISOString(), new Date().toISOString()]
            ];
            for (const [id, name, min, roi, task, status, created, updated] of defaultFunds) {
                await turso.execute(`
                    INSERT INTO funds (id, name, min, roi, task, status, created, updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [id, name, min, roi, task, status, created, updated]);
            }
            console.log('✅ Default funds created');
        }

        // Дефолтные проекты
        const projectsCheck = await turso.execute('SELECT * FROM projects LIMIT 1');
        if (projectsCheck.rows.length === 0) {
            const defaultProjects = [
                ['Hosting Fund Pro', 'Premium hosting infrastructure with high returns. Level 1: 10% ROI.', '10% ROI', '12,000 RSD', 'Level 1', '14 days', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop', 'active', new Date().toISOString(), new Date().toISOString(), 'hosting', 0, 0],
                ['Crypto Hosting', 'Crypto-optimized hosting with 25% ROI. Level 2: 25% ROI.', '25% ROI', '20,000 RSD', 'Level 2', '14 days', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop', 'active', new Date().toISOString(), new Date().toISOString(), 'crypto', 0, 0],
                ['Real Estate Servers', 'Premium real estate server infrastructure. Level 3: 35% ROI.', '35% ROI', '30,000 RSD', 'Level 3', '14 days', 'https://images.unsplash.com/photo-1544198365-f5d60b6d8190?w=600&h=400&fit=crop', 'active', new Date().toISOString(), new Date().toISOString(), 'realestate', 0, 0],
                ['AI Cloud Servers', 'Next-gen AI cloud infrastructure. Level 4: 40% ROI.', '40% ROI', '40,000 RSD', 'Level 4', '14 days', 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=400&fit=crop', 'active', new Date().toISOString(), new Date().toISOString(), 'ai', 0, 0],
                ['Green Energy Hosting', 'Sustainable hosting with 45% ROI. Level 5: 45% ROI.', '45% ROI', '50,000 RSD', 'Level 5', '14 days', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop', 'active', new Date().toISOString(), new Date().toISOString(), 'green', 0, 0],
                ['Turbo Servers', 'High-performance turbo servers with 50% ROI. Level 6: 50% ROI.', '50% ROI', '60,000 RSD', 'Level 6', '14 days', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop', 'active', new Date().toISOString(), new Date().toISOString(), 'hosting', 0, 0]
            ];
            for (const [title, desc, profit, min, risk, duration, image, status, created, updated, category, totalInvested, totalInvestors] of defaultProjects) {
                await turso.execute(`
                    INSERT INTO projects (title, desc, profit, min, risk, duration, image, status, created, updated, category, totalInvested, totalInvestors)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [title, desc, profit, min, risk, duration, image, status, created, updated, category, totalInvested, totalInvestors]);
            }
            console.log('✅ Default projects created');
        }

        // Дефолтные задачи
        const tasksCheck = await turso.execute('SELECT * FROM tasks LIMIT 1');
        if (tasksCheck.rows.length === 0) {
            const defaultTasks = [
                ['task1', 'Server Uptime Check', 'Verify all servers are online and responding', 0.5, 'daily', 'active', '["Log in to dashboard","Check server status","Report anomalies"]', new Date().toISOString(), null, 0],
                ['task2', 'SSL Certificate Renewal', 'Check SSL certificates and renew if needed', 1.0, 'weekly', 'active', '["List SSL certificates","Check expiration dates","Renew if needed"]', new Date().toISOString(), null, 0],
                ['task3', 'Security Audit Review', 'Review security logs for suspicious activity', 2.0, 'special', 'active', '["Access security logs","Review failed attempts","Report findings"]', new Date().toISOString(), null, 0]
            ];
            for (const [id, title, desc, bonus, type, status, steps, created, expires, completedCount] of defaultTasks) {
                await turso.execute(`
                    INSERT INTO tasks (id, title, description, bonus, type, status, steps, created, expires, completedCount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [id, title, desc, bonus, type, status, steps, created, expires, completedCount]);
            }
            console.log('✅ Default tasks created');
        }

        // Дефолтные новости
        const newsCheck = await turso.execute('SELECT * FROM news LIMIT 1');
        if (newsCheck.rows.length === 0) {
            const defaultNews = [
                ['Welcome to Profit House', 'We are excited to announce the launch of our new investment platform. Start earning passive income today!', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop', 'announcement', 'published', new Date().toISOString(), new Date().toISOString(), 0],
                ['New Investment Packages', 'We have added new investment packages with higher ROI. Check them out now!', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop', 'update', 'published', new Date().toISOString(), new Date().toISOString(), 0]
            ];
            for (const [title, content, image, category, status, created, updated, views] of defaultNews) {
                await turso.execute(`
                    INSERT INTO news (title, content, image, category, status, created, updated, views)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [title, content, image, category, status, created, updated, views]);
            }
            console.log('✅ Default news created');
        }

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

        await turso.execute('DELETE FROM daily_projects WHERE date < ?', [today]);

        const existing = await turso.execute('SELECT * FROM daily_projects WHERE date = ?', [today]);
        if (existing.rows.length === 0) {
            const dailyProjects = [
                ['🚀 Daily Boost Fund', 'Special daily investment with bonus returns!', '15% ROI', '12,000 RSD', 'Level 1', '1 day', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop', 2.0, today, tomorrow, 0],
                ['⚡ Flash Investment', 'Limited time daily offer. High returns!', '25% ROI', '20,000 RSD', 'Level 2', '1 day', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop', 3.0, today, tomorrow, 0],
                ['🌟 Daily Premium', 'Premium daily investment with guaranteed returns.', '35% ROI', '30,000 RSD', 'Level 3', '1 day', 'https://images.unsplash.com/photo-1544198365-f5d60b6d8190?w=600&h=400&fit=crop', 4.0, today, tomorrow, 0]
            ];
            for (const [title, desc, profit, min, risk, duration, image, bonus, date, expires, totalInvested] of dailyProjects) {
                await turso.execute(`
                    INSERT INTO daily_projects (title, desc, profit, min, risk, duration, image, bonus, date, expires, totalInvested)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [title, desc, profit, min, risk, duration, image, bonus, date, expires, totalInvested]);
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
                ['📊 Daily Server Check', 'Verify server status and report issues.', 1.0, '["Log in to dashboard","Check all server status indicators","Report anomalies"]', today, tomorrow, 'active', 0],
                ['🔐 Security Scan', 'Perform a security scan and review logs.', 1.5, '["Access security logs","Review failed attempts","Report findings"]', today, tomorrow, 'active', 0],
                ['💾 Backup Verification', 'Verify daily backups are running correctly.', 1.0, '["Check backup schedule","Verify backup sizes","Test restore"]', today, tomorrow, 'active', 0],
                ['🌐 DNS Record Check', 'Verify all DNS records are correct.', 0.8, '["Check DNS zone files","Verify A,CNAME,MX records","Update outdated records"]', today, tomorrow, 'active', 0]
            ];
            for (const [title, desc, bonus, steps, date, expires, status, completedCount] of dailyTasks) {
                await turso.execute(`
                    INSERT INTO daily_tasks (title, description, bonus, steps, date, expires, status, completedCount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [title, desc, bonus, steps, date, expires, status, completedCount]);
            }
            console.log('✅ Daily tasks generated for', today);
        }
    } catch (error) {
        console.error('❌ Error generating daily tasks:', error);
    }
}

// ================================================
// CRON ЗАДАЧИ
// ================================================
cron.schedule('0 0 * * *', () => {
    console.log('🔄 Running daily update at', new Date().toISOString());
    generateDailyProjects();
    generateDailyTasks();
});

cron.schedule('0 */6 * * *', () => {
    console.log('🔄 Running 6-hour update at', new Date().toISOString());
    // Очистка старых сессий или другие задачи
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
            version: '3.0.0'
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
        const { name, email, password, referralCode, phone, country, telegramId } = req.body;

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
            INSERT INTO users (id, name, email, password, role, status, created, refCode, referredBy, phone, country, telegramId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, name, email, hashedPassword, 'user', 'active', created, refCode, referralCode || null, phone || '', country || '', telegramId || '']);

        // Реферальный бонус
        let referralBonus = 0;
        if (referralCode) {
            const referrer = await turso.execute('SELECT * FROM users WHERE refCode = ?', [referralCode]);
            if (referrer.rows.length > 0) {
                const referrerUser = referrer.rows[0];
                const bonus = 1000;
                referralBonus = bonus;
                await turso.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [bonus, referrerUser.id]);
                await turso.execute(`
                    INSERT INTO transactions (id, userId, type, amount, method, status, date, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [generateTxId(), referrerUser.id, 'referral_bonus', bonus + ' RSD', 'Referral ' + referralCode, 'approved', new Date().toISOString(), `Referral bonus for inviting ${name}`]);
                
                // Записываем реферальный заработок
                await turso.execute(`
                    INSERT INTO referral_earnings (referrerId, referredId, amount, level, status, created)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [referrerUser.id, userId, bonus, 1, 'approved', new Date().toISOString()]);
                
                // Уведомление рефереру
                await turso.execute(`
                    INSERT INTO notifications (userId, title, message, type, created, icon)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [referrerUser.id, '🎉 New Referral!', `${name} joined using your referral link. You earned 1000 RSD bonus!`, 'success', new Date().toISOString(), 'users']);
            }
        }

        // Создаем настройки пользователя
        await turso.execute(`
            INSERT INTO user_settings (userId, walletAddress, bankDetails, notificationEnabled, twoFactorEnabled, updated, language, theme)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, '', '', 1, 0, new Date().toISOString(), 'en', 'light']);

        // Уведомление новому пользователю
        await turso.execute(`
            INSERT INTO notifications (userId, title, message, type, created, icon)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, '👋 Welcome to Profit House!', 'Start your investment journey today. Check out our daily projects and tasks to earn passive income.', 'info', new Date().toISOString(), 'welcome']);

        const token = jwt.sign({ id: userId, email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
        const user = { id: userId, name, email, role: 'user', balance: 0, totalInvested: 0, refCode, referralBonus };

        res.json({ success: true, token, user });
    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password, ip, userAgent } = req.body;

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

        // Обновляем информацию о входе
        const now = new Date().toISOString();
        await turso.execute(`
            UPDATE users SET lastLogin = ?, loginCount = loginCount + 1 WHERE id = ?
        `, [now, user.id]);

        // Записываем историю входа
        if (ip) {
            await turso.execute(`
                INSERT INTO login_history (userId, ip, userAgent, created)
                VALUES (?, ?, ?, ?)
            `, [user.id, ip, userAgent || 'Unknown', now]);
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
                status: user.status,
                lastLogin: user.lastLogin,
                loginCount: user.loginCount || 0
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
            'SELECT id, name, email, role, balance, totalInvested, refCode, status, lastLogin, loginCount FROM users WHERE id = ?',
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
            'SELECT id, name, email, role, status, created, balance, totalInvested, refCode, lastLogin, loginCount FROM users ORDER BY created DESC'
        );

        res.json({ success: true, users: result.rows });
    } catch (error) {
        console.error('❌ Users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

app.get('/api/users/:id', authenticate, async (req, res) => {
    try {
        const result = await turso.execute(
            'SELECT id, name, email, role, status, created, balance, totalInvested, refCode, lastLogin, loginCount, phone, country, telegramId FROM users WHERE id = ?',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('❌ Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

app.put('/api/users/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin' && req.userId !== req.params.id) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { balance, status, name, phone, country } = req.body;
        const userId = req.params.id;

        let query = 'UPDATE users SET ';
        const params = [];
        if (balance !== undefined) { query += 'balance = ?, '; params.push(balance); }
        if (status !== undefined) { query += 'status = ?, '; params.push(status); }
        if (name !== undefined) { query += 'name = ?, '; params.push(name); }
        if (phone !== undefined) { query += 'phone = ?, '; params.push(phone); }
        if (country !== undefined) { query += 'country = ?, '; params.push(country); }
        query = query.slice(0, -2) + ' WHERE id = ?';
        params.push(userId);

        await turso.execute(query, params);

        if (balance !== undefined) {
            await turso.execute(`
                INSERT INTO transactions (id, userId, type, amount, method, status, date, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [generateTxId(), userId, 'admin_adjustment', balance + ' RSD', 'Admin', 'approved', new Date().toISOString(), 'Balance adjusted by admin']);
        }

        res.json({ success: true, message: 'User updated' });
    } catch (error) {
        console.error('❌ Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.delete('/api/users/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await turso.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
        await turso.execute('DELETE FROM user_settings WHERE userId = ?', [req.params.id]);
        
        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        console.error('❌ Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ============ USER SETTINGS ============
app.get('/api/user/settings', authenticate, async (req, res) => {
    try {
        const result = await turso.execute('SELECT * FROM user_settings WHERE userId = ?', [req.userId]);
        if (result.rows.length === 0) {
            await turso.execute(`
                INSERT INTO user_settings (userId, walletAddress, bankDetails, notificationEnabled, twoFactorEnabled, updated, language, theme)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [req.userId, '', '', 1, 0, new Date().toISOString(), 'en', 'light']);
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
        const { walletAddress, bankDetails, notificationEnabled, twoFactorEnabled, language, theme } = req.body;

        await turso.execute(`
            UPDATE user_settings 
            SET walletAddress = ?, bankDetails = ?, notificationEnabled = ?, twoFactorEnabled = ?, updated = ?, language = ?, theme = ?
            WHERE userId = ?
        `, [walletAddress || '', bankDetails || '', notificationEnabled !== undefined ? notificationEnabled : 1, 
            twoFactorEnabled !== undefined ? twoFactorEnabled : 0, new Date().toISOString(), language || 'en', theme || 'light', req.userId]);

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

        // Получаем реферальные заработки
        const earningsResult = await turso.execute(
            'SELECT SUM(amount) as total FROM referral_earnings WHERE referrerId = ? AND status = ?',
            [userId, 'approved']
        );
        const totalEarnings = earningsResult.rows[0]?.total || 0;

        res.json({
            success: true,
            direct: direct.length,
            level2: level2.length,
            level3: level3.length,
            referrals: direct,
            totalEarnings: totalEarnings
        });
    } catch (error) {
        console.error('❌ Referrals error:', error);
        res.status(500).json({ error: 'Failed to get referrals' });
    }
});

// ============ TRANSACTIONS ============
app.get('/api/transactions', authenticate, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const result = await turso.execute(
            'SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC LIMIT ? OFFSET ?',
            [req.userId, parseInt(limit), parseInt(offset)]
        );

        const countResult = await turso.execute(
            'SELECT COUNT(*) as total FROM transactions WHERE userId = ?',
            [req.userId]
        );

        res.json({ 
            success: true, 
            transactions: result.rows,
            total: countResult.rows[0]?.total || 0,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('❌ Transactions error:', error);
        res.status(500).json({ error: 'Failed to get transactions' });
    }
});

app.post('/api/transactions', authenticate, async (req, res) => {
    try {
        const { type, amount, method, status, description } = req.body;
        const id = generateTxId();
        const date = new Date().toISOString();

        await turso.execute(`
            INSERT INTO transactions (id, userId, type, amount, method, status, date, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, req.userId, type, amount, method, status || 'pending', date, description || '']);

        res.json({
            success: true,
            transaction: { id, userId: req.userId, type, amount, method, status: status || 'pending', date, description: description || '' }
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
            INSERT INTO investments (id, userId, projectId, projectTitle, amount, invested, withdrawn, roi, status, date, lastPayout, totalPayouts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, req.userId, projectId, projectTitle, amount, amount, 0, roi, 'active', date, date, 0]);

        // Обновляем проект
        await turso.execute(`
            UPDATE projects SET totalInvested = totalInvested + ?, totalInvestors = totalInvestors + 1 WHERE id = ?
        `, [amount, projectId]);

        res.json({
            success: true,
            investment: { id, userId: req.userId, projectId, projectTitle, amount, invested: amount, withdrawn: 0, roi, status: 'active', date, lastPayout: date, totalPayouts: 0 }
        });
    } catch (error) {
        console.error('❌ Create investment error:', error);
        res.status(500).json({ error: 'Failed to create investment' });
    }
});

app.put('/api/investments/:id', authenticate, async (req, res) => {
    try {
        const { status, withdrawn } = req.body;
        const investmentId = req.params.id;

        let query = 'UPDATE investments SET ';
        const params = [];
        if (status !== undefined) { query += 'status = ?, '; params.push(status); }
        if (withdrawn !== undefined) { query += 'withdrawn = ?, '; params.push(withdrawn); }
        query = query.slice(0, -2) + ' WHERE id = ? AND userId = ?';
        params.push(investmentId, req.userId);

        await turso.execute(query, params);

        res.json({ success: true, message: 'Investment updated' });
    } catch (error) {
        console.error('❌ Update investment error:', error);
        res.status(500).json({ error: 'Failed to update investment' });
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
                INSERT INTO notifications (userId, title, message, type, created, icon)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [admin.id, '📩 New Feedback', `${user.name} sent new feedback: "${message.substring(0, 50)}..."`, 'info', new Date().toISOString(), 'feedback']);
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

        const { status, response } = req.body;
        const now = new Date().toISOString();
        
        await turso.execute(`
            UPDATE feedback SET status = ?, response = ?, respondedAt = ?, respondedBy = ?
            WHERE id = ?
        `, [status, response || null, now, req.userId, req.params.id]);

        // Уведомление пользователю
        const feedbackResult = await turso.execute('SELECT userId FROM feedback WHERE id = ?', [req.params.id]);
        if (feedbackResult.rows.length > 0) {
            const userId = feedbackResult.rows[0].userId;
            await turso.execute(`
                INSERT INTO notifications (userId, title, message, type, created, icon)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [userId, '📬 Feedback Response', `Your feedback has been ${status}. Thank you for your input!`, 'info', new Date().toISOString(), 'feedback']);
        }

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
                INSERT INTO notifications (userId, title, message, type, created, icon)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [admin.id, '🎫 New Support Ticket', `New ticket: "${subject}"`, 'info', new Date().toISOString(), 'support']);
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

        const { status, priority, resolution, assignedTo } = req.body;
        const now = new Date().toISOString();
        const closedAt = status === 'closed' ? now : null;

        await turso.execute(`
            UPDATE support_tickets 
            SET status = ?, priority = ?, updated = ?, resolution = ?, assignedTo = ?, closedAt = ?
            WHERE id = ?
        `, [status || 'open', priority || 'normal', now, resolution || null, assignedTo || null, closedAt, req.params.id]);

        // Уведомление пользователю
        const ticketResult = await turso.execute('SELECT userId, subject FROM support_tickets WHERE id = ?', [req.params.id]);
        if (ticketResult.rows.length > 0) {
            const ticket = ticketResult.rows[0];
            await turso.execute(`
                INSERT INTO notifications (userId, title, message, type, created, icon)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [ticket.userId, `📝 Ticket Update`, `Your ticket "${ticket.subject}" has been ${status}`, 'info', new Date().toISOString(), 'support']);
        }

        res.json({ success: true, message: 'Ticket updated' });
    } catch (error) {
        console.error('❌ Update ticket error:', error);
        res.status(500).json({ error: 'Failed to update ticket' });
    }
});

// ============ NOTIFICATIONS ============
app.get('/api/notifications', authenticate, async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const result = await turso.execute(
            'SELECT * FROM notifications WHERE userId = ? ORDER BY created DESC LIMIT ? OFFSET ?',
            [req.userId, parseInt(limit), parseInt(offset)]
        );

        const unreadResult = await turso.execute(
            'SELECT COUNT(*) as unread FROM notifications WHERE userId = ? AND read = 0',
            [req.userId]
        );

        res.json({ 
            success: true, 
            notifications: result.rows,
            unread: unreadResult.rows[0]?.unread || 0
        });
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
        const { category, limit = 20, offset = 0 } = req.query;
        let query = 'SELECT * FROM projects WHERE status = ?';
        const params = ['active'];
        
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        query += ' ORDER BY created DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const result = await turso.execute(query, params);
        
        const countResult = await turso.execute(
            'SELECT COUNT(*) as total FROM projects WHERE status = ?' + (category ? ' AND category = ?' : ''),
            category ? ['active', category] : ['active']
        );

        res.json({ 
            success: true, 
            projects: result.rows,
            total: countResult.rows[0]?.total || 0
        });
    } catch (error) {
        console.error('❌ Projects error:', error);
        res.status(500).json({ error: 'Failed to get projects' });
    }
});

app.get('/api/projects/:id', async (req, res) => {
    try {
        const result = await turso.execute('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.json({ success: true, project: result.rows[0] });
    } catch (error) {
        console.error('❌ Get project error:', error);
        res.status(500).json({ error: 'Failed to get project' });
    }
});

app.post('/api/projects', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { title, desc, profit, min, risk, duration, image, status, category } = req.body;
        if (!title || !desc || !profit || !min || !risk) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        await turso.execute(`
            INSERT INTO projects (title, desc, profit, min, risk, duration, image, status, created, updated, category, totalInvested, totalInvestors)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [title, desc, profit, min, risk, duration || '14 days', image || '', status || 'active', new Date().toISOString(), new Date().toISOString(), category || 'hosting', 0, 0]);

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

        const { title, desc, profit, min, risk, duration, image, status, category } = req.body;
        await turso.execute(`
            UPDATE projects 
            SET title = ?, desc = ?, profit = ?, min = ?, risk = ?, duration = ?, image = ?, status = ?, updated = ?, category = ?
            WHERE id = ?
        `, [title, desc, profit, min, risk, duration, image, status, new Date().toISOString(), category || 'hosting', req.params.id]);

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

app.get('/api/tasks/:id', async (req, res) => {
    try {
        const result = await turso.execute('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const task = result.rows[0];
        try { task.steps = JSON.parse(task.steps); } catch (e) { task.steps = []; }
        res.json({ success: true, task });
    } catch (error) {
        console.error('❌ Get task error:', error);
        res.status(500).json({ error: 'Failed to get task' });
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
            INSERT INTO tasks (id, title, description, bonus, type, status, steps, created, expires, completedCount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, title, description, bonus, type, 'active', JSON.stringify(steps || []), new Date().toISOString(), expires || null, 0]);

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

        // Обновляем счетчик выполнений задачи
        await turso.execute('UPDATE daily_tasks SET completedCount = completedCount + 1 WHERE id = ?', [taskId]);

        let bonusAmount = 0;
        if (task.bonus > 0) {
            const totalInvested = user.totalInvested || 1000;
            bonusAmount = totalInvested * (task.bonus / 100);
            if (bonusAmount > 0) {
                await turso.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [bonusAmount, req.userId]);
                await turso.execute(`
                    INSERT INTO transactions (id, userId, type, amount, method, status, date, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [generateTxId(), req.userId, 'task_bonus', bonusAmount.toFixed(2) + ' RSD', 'Daily Task: ' + task.title, 'approved', new Date().toISOString(), `Completed daily task: ${task.title}`]);
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
        const result = await turso.execute('SELECT * FROM funds ORDER BY created DESC');
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
        const now = new Date().toISOString();
        await turso.execute(`
            INSERT INTO funds (id, name, min, roi, task, status, created, updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, name, min, roi, task, status || 'active', now, now]);

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
            UPDATE funds SET name = ?, min = ?, roi = ?, task = ?, status = ?, updated = ?
            WHERE id = ?
        `, [name, min, roi, task, status, new Date().toISOString(), req.params.id]);

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
        await turso.execute('INSERT OR REPLACE INTO settings (key, value, updated) VALUES (?, ?, ?)', 
            [key, value, new Date().toISOString()]);
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
                INSERT INTO notifications (userId, title, message, type, created, icon)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [admin.id, '💰 New Withdrawal Request', `${userName} requested withdrawal of ${amount}`, 'info', new Date().toISOString(), 'withdraw']);
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

        const { status, adminNote, transactionId } = req.body;
        const now = new Date().toISOString();
        const processedAt = status === 'approved' || status === 'rejected' ? now : null;

        await turso.execute(`
            UPDATE withdrawals 
            SET status = ?, processedAt = ?, adminNote = ?, transactionId = ?
            WHERE id = ?
        `, [status, processedAt, adminNote || null, transactionId || null, req.params.id]);

        // Уведомление пользователю
        const wdResult = await turso.execute('SELECT userId, amount FROM withdrawals WHERE id = ?', [req.params.id]);
        if (wdResult.rows.length > 0) {
            const wd = wdResult.rows[0];
            await turso.execute(`
                INSERT INTO notifications (userId, title, message, type, created, icon)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [wd.userId, `💰 Withdrawal ${status}`, `Your withdrawal of ${wd.amount} has been ${status}`, status === 'approved' ? 'success' : 'info', new Date().toISOString(), 'withdraw']);
        }

        res.json({ success: true, message: 'Withdrawal updated' });
    } catch (error) {
        console.error('❌ Update withdrawal error:', error);
        res.status(500).json({ error: 'Failed to update withdrawal' });
    }
});

// ============ NEWS ============
app.get('/api/news', async (req, res) => {
    try {
        const { limit = 10, offset = 0 } = req.query;
        const result = await turso.execute(
            'SELECT * FROM news WHERE status = ? ORDER BY created DESC LIMIT ? OFFSET ?',
            ['published', parseInt(limit), parseInt(offset)]
        );
        res.json({ success: true, news: result.rows });
    } catch (error) {
        console.error('❌ News error:', error);
        res.status(500).json({ error: 'Failed to get news' });
    }
});

app.post('/api/news', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { title, content, image, category, status } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }

        await turso.execute(`
            INSERT INTO news (title, content, image, category, status, created, updated, views)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [title, content, image || '', category || 'general', status || 'published', new Date().toISOString(), new Date().toISOString(), 0]);

        res.json({ success: true, message: 'News created' });
    } catch (error) {
        console.error('❌ Create news error:', error);
        res.status(500).json({ error: 'Failed to create news' });
    }
});

app.put('/api/news/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { title, content, image, category, status } = req.body;
        await turso.execute(`
            UPDATE news 
            SET title = ?, content = ?, image = ?, category = ?, status = ?, updated = ?
            WHERE id = ?
        `, [title, content, image, category, status, new Date().toISOString(), req.params.id]);

        res.json({ success: true, message: 'News updated' });
    } catch (error) {
        console.error('❌ Update news error:', error);
        res.status(500).json({ error: 'Failed to update news' });
    }
});

app.delete('/api/news/:id', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await turso.execute('DELETE FROM news WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'News deleted' });
    } catch (error) {
        console.error('❌ Delete news error:', error);
        res.status(500).json({ error: 'Failed to delete news' });
    }
});

// ============ ADMIN - ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ============
app.post('/api/admin/init-db', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const tables = req.body.tables || [];
        const created = [];

        const tableSchemas = {
            users: `CREATE TABLE IF NOT EXISTS users (
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
                lastTaskDate TEXT,
                telegramId TEXT,
                phone TEXT,
                country TEXT,
                lastLogin TEXT,
                loginCount INTEGER DEFAULT 0
            )`,
            transactions: `CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                type TEXT NOT NULL,
                amount TEXT NOT NULL,
                method TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                date TEXT NOT NULL,
                description TEXT,
                adminNote TEXT
            )`,
            funds: `CREATE TABLE IF NOT EXISTS funds (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                min REAL NOT NULL,
                roi REAL NOT NULL,
                task TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                created TEXT NOT NULL,
                updated TEXT NOT NULL
            )`,
            projects: `CREATE TABLE IF NOT EXISTS projects (
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
                updated TEXT NOT NULL,
                category TEXT DEFAULT 'hosting',
                totalInvested REAL DEFAULT 0,
                totalInvestors INTEGER DEFAULT 0
            )`,
            daily_projects: `CREATE TABLE IF NOT EXISTS daily_projects (
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
                expires TEXT NOT NULL,
                totalInvested REAL DEFAULT 0
            )`,
            tasks: `CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                bonus REAL NOT NULL,
                type TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                steps TEXT DEFAULT '[]',
                created TEXT NOT NULL,
                expires TEXT,
                completedCount INTEGER DEFAULT 0
            )`,
            daily_tasks: `CREATE TABLE IF NOT EXISTS daily_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                bonus REAL NOT NULL,
                steps TEXT DEFAULT '[]',
                date TEXT NOT NULL,
                expires TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                completedCount INTEGER DEFAULT 0
            )`,
            settings: `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated TEXT NOT NULL
            )`,
            investments: `CREATE TABLE IF NOT EXISTS investments (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                projectId INTEGER NOT NULL,
                projectTitle TEXT NOT NULL,
                amount REAL NOT NULL,
                invested REAL NOT NULL,
                withdrawn REAL DEFAULT 0,
                roi REAL NOT NULL,
                status TEXT DEFAULT 'active',
                date TEXT NOT NULL,
                lastPayout TEXT,
                totalPayouts REAL DEFAULT 0
            )`,
            feedback: `CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                rating INTEGER DEFAULT 5,
                status TEXT DEFAULT 'pending',
                created TEXT NOT NULL,
                response TEXT,
                respondedAt TEXT,
                respondedBy TEXT
            )`,
            support_tickets: `CREATE TABLE IF NOT EXISTS support_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                priority TEXT DEFAULT 'normal',
                created TEXT NOT NULL,
                updated TEXT NOT NULL,
                assignedTo TEXT,
                resolution TEXT,
                closedAt TEXT
            )`,
            notifications: `CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT DEFAULT 'info',
                read INTEGER DEFAULT 0,
                created TEXT NOT NULL,
                actionUrl TEXT,
                icon TEXT DEFAULT 'bell'
            )`,
            user_settings: `CREATE TABLE IF NOT EXISTS user_settings (
                userId TEXT PRIMARY KEY,
                walletAddress TEXT,
                bankDetails TEXT,
                notificationEnabled INTEGER DEFAULT 1,
                twoFactorEnabled INTEGER DEFAULT 0,
                updated TEXT NOT NULL,
                language TEXT DEFAULT 'en',
                theme TEXT DEFAULT 'light'
            )`,
            withdrawals: `CREATE TABLE IF NOT EXISTS withdrawals (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                userName TEXT NOT NULL,
                amount TEXT NOT NULL,
                method TEXT NOT NULL,
                address TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                date TEXT NOT NULL,
                processedAt TEXT,
                adminNote TEXT,
                transactionId TEXT
            )`,
            news: `CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                image TEXT,
                category TEXT DEFAULT 'general',
                status TEXT DEFAULT 'published',
                created TEXT NOT NULL,
                updated TEXT NOT NULL,
                views INTEGER DEFAULT 0
            )`,
            referral_earnings: `CREATE TABLE IF NOT EXISTS referral_earnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrerId TEXT NOT NULL,
                referredId TEXT NOT NULL,
                amount REAL NOT NULL,
                level INTEGER DEFAULT 1,
                status TEXT DEFAULT 'pending',
                created TEXT NOT NULL,
                paidAt TEXT
            )`,
            login_history: `CREATE TABLE IF NOT EXISTS login_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                ip TEXT,
                userAgent TEXT,
                location TEXT,
                created TEXT NOT NULL
            )`
        };

        for (const table of tables) {
            if (tableSchemas[table]) {
                await turso.execute(tableSchemas[table]);
                created.push(table);
            }
        }

        res.json({ success: true, created, message: 'Tables created successfully' });
    } catch (error) {
        console.error('❌ Init DB error:', error);
        res.status(500).json({ error: 'Failed to initialize database' });
    }
});

// ============ ADMIN - CREATE ADMIN ============
app.post('/api/admin/create-admin', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { email, password, name } = req.body;
        
        const existing = await turso.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.rows.length > 0) {
            return res.json({ success: true, message: 'Admin already exists' });
        }

        const userId = generateId();
        const refCode = generateRefCode();
        const hashedPassword = bcrypt.hashSync(password, 10);
        const now = new Date().toISOString();

        await turso.execute(`
            INSERT INTO users (id, name, email, password, role, status, created, refCode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, name, email, hashedPassword, 'admin', 'active', now, refCode]);

        // Создаем настройки для админа
        await turso.execute(`
            INSERT INTO user_settings (userId, walletAddress, bankDetails, notificationEnabled, twoFactorEnabled, updated, language, theme)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, '', '', 1, 0, now, 'en', 'light']);

        res.json({ success: true, message: 'Admin created successfully' });
    } catch (error) {
        console.error('❌ Create admin error:', error);
        res.status(500).json({ error: 'Failed to create admin' });
    }
});

// ============ ADMIN - INIT DEFAULT DATA ============
app.post('/api/admin/init-default-data', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await initDefaultData();
        await generateDailyProjects();
        await generateDailyTasks();

        res.json({ success: true, message: 'Default data initialized' });
    } catch (error) {
        console.error('❌ Init default data error:', error);
        res.status(500).json({ error: 'Failed to initialize default data' });
    }
});

// ============ ADMIN - GET STATS ============
app.get('/api/admin/stats', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const [usersResult, investmentsResult, transactionsResult, withdrawalsResult, feedbackResult] = await Promise.all([
            turso.execute('SELECT COUNT(*) as total, SUM(balance) as totalBalance FROM users'),
            turso.execute('SELECT COUNT(*) as total, SUM(amount) as totalAmount FROM investments WHERE status = ?', ['active']),
            turso.execute('SELECT COUNT(*) as total, SUM(CAST(REPLACE(amount, " RSD", "") AS REAL)) as totalAmount FROM transactions WHERE status = ?', ['approved']),
            turso.execute('SELECT COUNT(*) as total FROM withdrawals WHERE status = ?', ['pending']),
            turso.execute('SELECT COUNT(*) as total FROM feedback WHERE status = ?', ['pending'])
        ]);

        res.json({
            success: true,
            stats: {
                users: {
                    total: usersResult.rows[0]?.total || 0,
                    totalBalance: usersResult.rows[0]?.totalBalance || 0
                },
                investments: {
                    total: investmentsResult.rows[0]?.total || 0,
                    totalAmount: investmentsResult.rows[0]?.totalAmount || 0
                },
                transactions: {
                    total: transactionsResult.rows[0]?.total || 0,
                    totalAmount: transactionsResult.rows[0]?.totalAmount || 0
                },
                pendingWithdrawals: withdrawalsResult.rows[0]?.total || 0,
                pendingFeedback: feedbackResult.rows[0]?.total || 0
            }
        });
    } catch (error) {
        console.error('❌ Get stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// ============ SYNC ============
app.get('/api/sync', authenticate, async (req, res) => {
    try {
        const [users, transactions, funds, projects, tasks, dailyProjects, dailyTasks, settingsRows, feedback, support, withdrawals, notifications, investments, news] = await Promise.all([
            turso.execute('SELECT id, name, email, role, status, created, balance, totalInvested, refCode, referredBy, dailyTasksCompleted, lastTaskDate, phone, country, telegramId, lastLogin, loginCount FROM users'),
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
            turso.execute('SELECT * FROM notifications WHERE userId = ? ORDER BY created DESC LIMIT 20', [req.userId]),
            turso.execute('SELECT * FROM investments WHERE userId = ? ORDER BY date DESC LIMIT 50', [req.userId]),
            turso.execute('SELECT * FROM news WHERE status = ? ORDER BY created DESC LIMIT 10', ['published'])
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
                notifications: notifications.rows,
                investments: investments.rows,
                news: news.rows
            }
        });
    } catch (error) {
        console.error('❌ Sync error:', error);
        res.status(500).json({ error: 'Sync failed: ' + error.message });
    }
});

// ============ ROOT ============
app.get('/', (req, res) => {
    res.json({
        name: 'Profit House API',
        version: '3.0.0',
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
            news: '/api/news',
            sync: '/api/sync',
            health: '/api/health',
            admin: '/api/admin/*'
        }
    });
});

// ================================================
// ЗАПУСК СЕРВЕРА
// ================================================
async function startServer() {
    try {
        await initDatabase();
        
        // Запускаем ежедневную генерацию
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
