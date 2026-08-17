const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'profit_house_secret_2026';

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
// БАЗА ДАННЫХ
// ================================================
const dbPath = path.join(__dirname, 'database.sqlite');
console.log('📁 Database path:', dbPath);

// Проверяем доступность директории
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log('✅ Database directory created');
    } catch (err) {
        console.error('❌ Failed to create database directory:', err);
    }
}

// Открываем базу данных с обработкой ошибок
let db;
try {
    db = new sqlite3.Database(dbPath);
    console.log('✅ SQLite database opened successfully');
} catch (err) {
    console.error('❌ Failed to open database:', err);
    process.exit(1);
}

// ================================================
// ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ
// ================================================
function initDatabase() {
    const tables = [
        // Users table
        `CREATE TABLE IF NOT EXISTS users (
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
            taskCompleted TEXT DEFAULT '{}'
        )`,
        
        // Transactions table
        `CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            type TEXT NOT NULL,
            amount TEXT NOT NULL,
            method TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            date TEXT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id)
        )`,
        
        // Funds table
        `CREATE TABLE IF NOT EXISTS funds (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            min REAL NOT NULL,
            roi REAL NOT NULL,
            task TEXT NOT NULL,
            status TEXT DEFAULT 'active'
        )`,
        
        // Projects table
        `CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            desc TEXT NOT NULL,
            profit TEXT NOT NULL,
            min TEXT NOT NULL,
            risk TEXT NOT NULL,
            duration TEXT DEFAULT '14 days',
            image TEXT
        )`,
        
        // Tasks table
        `CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            bonus REAL NOT NULL,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            steps TEXT DEFAULT '[]'
        )`,
        
        // Settings table
        `CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`,
        
        // Investments table
        `CREATE TABLE IF NOT EXISTS investments (
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
            FOREIGN KEY (userId) REFERENCES users(id)
        )`
    ];

    db.serialize(() => {
        tables.forEach((sql, index) => {
            db.run(sql, (err) => {
                if (err) {
                    console.error(`❌ Table ${index + 1} creation error:`, err.message);
                } else {
                    console.log(`✅ Table ${index + 1} ready`);
                }
            });
        });
        
        // Создаем индексы
        db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        db.run('CREATE INDEX IF NOT EXISTS idx_users_refCode ON users(refCode)');
        db.run('CREATE INDEX IF NOT EXISTS idx_transactions_userId ON transactions(userId)');
        db.run('CREATE INDEX IF NOT EXISTS idx_investments_userId ON investments(userId)');
        
        console.log('✅ Database initialization complete');
    });
}

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

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// ================================================
// ИНИЦИАЛИЗАЦИЯ ДАННЫХ
// ================================================
async function initDefaultData() {
    try {
        // Проверяем и создаем админа
        const adminEmail = 'attackavgustov@proton.me';
        const adminExists = await getQuery('SELECT * FROM users WHERE email = ?', [adminEmail]);
        
        if (!adminExists) {
            const adminId = generateId();
            const hashedPassword = bcrypt.hashSync('l39503950l', 10);
            await runQuery(`
                INSERT INTO users (id, name, email, password, role, status, created, refCode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [adminId, 'Administrator', adminEmail, hashedPassword, 'admin', 'active', new Date().toISOString(), 'ADMIN01']);
            console.log('✅ Admin user created');
        }

        // Проверяем настройки
        const settings = await getQuery('SELECT * FROM settings WHERE key = ?', ['ton']);
        if (!settings) {
            const defaultSettings = [
                ['ton', 'UQBIN3fAThhmWe8m2_BM_pEA2PPrBN4r7_Oj16vN0rkfS94a'],
                ['usdt', 'TNp3epj1ReAxkHSXjpVwvDYP78i4cRbEAH'],
                ['bank', 'Bank: Raiffeisen Bank\nAccount: 123-456-789\nSWIFT: RAIFFEIS']
            ];
            for (const [key, value] of defaultSettings) {
                await runQuery('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
            }
            console.log('✅ Default settings created');
        }

        // Проверяем фонды
        const funds = await getQuery('SELECT * FROM funds LIMIT 1');
        if (!funds) {
            const defaultFunds = [
                ['fund_001', 'Hosting Fund', 12000, 2.0, 'Buy domain, renew SSL', 'active'],
                ['fund_002', 'Crypto Fund', 20000, 2.5, 'Confirm transactions, update wallets', 'active'],
                ['fund_003', 'Real Estate Fund', 30000, 3.0, 'Review offers, update prices', 'active']
            ];
            for (const [id, name, min, roi, task, status] of defaultFunds) {
                await runQuery(`
                    INSERT INTO funds (id, name, min, roi, task, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [id, name, min, roi, task, status]);
            }
            console.log('✅ Default funds created');
        }

        // Проверяем проекты
        const projects = await getQuery('SELECT * FROM projects LIMIT 1');
        if (!projects) {
            const defaultProjects = [
                ['Hosting Fund', 'Buy domains, renew SSL, upgrade servers. Level 1: 10% ROI.', '10% ROI', '12,000 RSD', 'Level 1', '14 days', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop'],
                ['Crypto Fund', 'Confirm transactions, update wallets, track exchange rates. Level 2: 25% ROI.', '25% ROI', '20,000 RSD', 'Level 2', '14 days', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop'],
                ['Real Estate Fund', 'Review offers, update prices, model rental conditions. Level 3: 35% ROI.', '35% ROI', '30,000 RSD', 'Level 3', '14 days', 'https://images.unsplash.com/photo-1544198365-f5d60b6d8190?w=600&h=400&fit=crop']
            ];
            for (const [title, desc, profit, min, risk, duration, image] of defaultProjects) {
                await runQuery(`
                    INSERT INTO projects (title, desc, profit, min, risk, duration, image)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [title, desc, profit, min, risk, duration, image]);
            }
            console.log('✅ Default projects created');
        }

        // Проверяем задачи
        const tasks = await getQuery('SELECT * FROM tasks LIMIT 1');
        if (!tasks) {
            const defaultTasks = [
                ['task1', 'Server Uptime Check', 'Verify that all servers are online and responding to ping requests.', 0.5, 'daily', 'active', '["Log in to monitoring dashboard","Check all server status indicators","Report any anomalies"]'],
                ['task2', 'SSL Certificate Renewal', 'Check all SSL certificates for expiration and renew any that are close to expiring.', 1.0, 'weekly', 'active', '["List all domains with SSL certificates","Check expiration dates","Renew certificates that expire within 30 days"]'],
                ['task3', 'Security Audit Review', 'Review security logs and check for any suspicious activity.', 2.0, 'special', 'active', '["Access security log dashboard","Review all failed login attempts","Report any security findings"]']
            ];
            for (const [id, title, desc, bonus, type, status, steps] of defaultTasks) {
                await runQuery(`
                    INSERT INTO tasks (id, title, description, bonus, type, status, steps)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [id, title, desc, bonus, type, status, steps]);
            }
            console.log('✅ Default tasks created');
        }

        console.log('✅ Default data initialization complete');
    } catch (error) {
        console.error('❌ Default data initialization error:', error);
    }
}

// ================================================
// API ЭНДПОИНТЫ
// ================================================

// ============ HEALTH ============
app.get('/api/health', (req, res) => {
    db.get('SELECT 1', (err) => {
        if (err) {
            return res.status(500).json({
                status: 'error',
                database: 'disconnected',
                error: err.message
            });
        }
        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0'
        });
    });
});

app.get('/', (req, res) => {
    res.json({
        name: 'Profit House API',
        version: '1.0.0',
        status: 'running',
        database: 'SQLite',
        endpoints: {
            auth: '/api/login, /api/register, /api/verify',
            users: '/api/users, /api/users/:id',
            referrals: '/api/users/:userId/referrals',
            transactions: '/api/transactions',
            sync: '/api/sync (GET/POST)',
            funds: '/api/funds',
            projects: '/api/projects',
            tasks: '/api/tasks',
            settings: '/api/settings',
            health: '/api/health'
        }
    });
});

// ============ AUTH ============
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, referralCode } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Проверяем существующего пользователя
        const existingUser = await getQuery('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const userId = generateId();
        const refCode = generateRefCode();
        const hashedPassword = bcrypt.hashSync(password, 10);
        const created = new Date().toISOString();

        // Создаем пользователя
        await runQuery(`
            INSERT INTO users (id, name, email, password, role, status, created, refCode, referredBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, name, email, hashedPassword, 'user', 'active', created, refCode, referralCode || null]);

        // Реферальный бонус
        if (referralCode) {
            const referrer = await getQuery('SELECT * FROM users WHERE refCode = ?', [referralCode]);
            if (referrer) {
                const bonus = 1000;
                await runQuery('UPDATE users SET balance = balance + ? WHERE id = ?', [bonus, referrer.id]);
                await runQuery(`
                    INSERT INTO transactions (id, userId, type, amount, method, status, date)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [generateTxId(), referrer.id, 'referral_bonus', bonus + ' RSD', 'Referral ' + referralCode, 'approved', new Date().toISOString()]);
            }
        }

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

        const user = await getQuery('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

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
        const user = await getQuery(
            'SELECT id, name, email, role, balance, totalInvested, refCode, status FROM users WHERE id = ?',
            [req.userId]
        );

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        res.json({ success: true, user });
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

        const users = await allQuery(
            'SELECT id, name, email, role, status, created, balance, totalInvested, refCode FROM users'
        );

        res.json({ success: true, users });
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

        await runQuery(query, params);
        res.json({ success: true, message: 'User updated' });
    } catch (error) {
        console.error('❌ Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ============ REFERRALS ============
app.get('/api/users/:userId/referrals', authenticate, async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const user = await getQuery('SELECT refCode FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const direct = await allQuery('SELECT * FROM users WHERE referredBy = ?', [user.refCode]);
        
        let level2 = [];
        let level3 = [];

        for (const ref of direct) {
            const l2 = await allQuery('SELECT * FROM users WHERE referredBy = ?', [ref.refCode]);
            level2 = [...level2, ...l2];
        }

        for (const ref of level2) {
            const l3 = await allQuery('SELECT * FROM users WHERE referredBy = ?', [ref.refCode]);
            level3 = [...level3, ...l3];
        }

        res.json({
            success: true,
            direct: direct.length,
            level2: level2.length,
            level3: level3.length
        });
    } catch (error) {
        console.error('❌ Referrals error:', error);
        res.status(500).json({ error: 'Failed to get referrals' });
    }
});

// ============ TRANSACTIONS ============
app.get('/api/transactions', authenticate, async (req, res) => {
    try {
        const transactions = await allQuery(
            'SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC',
            [req.userId]
        );

        res.json({ success: true, transactions });
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

        await runQuery(`
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

// ============ SYNC ============
app.get('/api/sync', authenticate, async (req, res) => {
    try {
        const [users, transactions, funds, projects, tasks, settingsRows] = await Promise.all([
            allQuery('SELECT id, name, email, role, status, created, balance, totalInvested, refCode, referredBy FROM users'),
            allQuery('SELECT * FROM transactions'),
            allQuery('SELECT * FROM funds'),
            allQuery('SELECT * FROM projects'),
            allQuery('SELECT * FROM tasks'),
            allQuery('SELECT * FROM settings')
        ]);

        const settings = {};
        settingsRows.forEach(s => settings[s.key] = s.value);

        res.json({
            success: true,
            data: { users, transactions, funds, projects, tasks, settings }
        });
    } catch (error) {
        console.error('❌ Sync error:', error);
        res.status(500).json({ error: 'Sync failed' });
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
                await runQuery(`
                    INSERT OR REPLACE INTO funds (id, name, min, roi, task, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [fund.id, fund.name, fund.min, fund.roi, fund.task, fund.status]);
            }
        }

        // Сохраняем проекты
        if (data.projects) {
            for (const project of data.projects) {
                await runQuery(`
                    INSERT OR REPLACE INTO projects (id, title, desc, profit, min, risk, duration, image)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [project.id, project.title, project.desc, project.profit, project.min, project.risk, project.duration || '14 days', project.image]);
            }
        }

        // Сохраняем задачи
        if (data.tasks) {
            for (const task of data.tasks) {
                await runQuery(`
                    INSERT OR REPLACE INTO tasks (id, title, description, bonus, type, status, steps)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [task.id, task.title, task.description, task.bonus, task.type, task.status, JSON.stringify(task.steps || [])]);
            }
        }

        // Сохраняем настройки
        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                await runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
            }
        }

        res.json({ success: true, message: 'Data synced successfully' });
    } catch (error) {
        console.error('❌ Sync error:', error);
        res.status(500).json({ error: 'Sync failed: ' + error.message });
    }
});

// ============ FUNDS ============
app.get('/api/funds', async (req, res) => {
    try {
        const funds = await allQuery('SELECT * FROM funds');
        res.json({ success: true, funds });
    } catch (error) {
        console.error('❌ Funds error:', error);
        res.status(500).json({ error: 'Failed to get funds' });
    }
});

// ============ PROJECTS ============
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await allQuery('SELECT * FROM projects');
        res.json({ success: true, projects });
    } catch (error) {
        console.error('❌ Projects error:', error);
        res.status(500).json({ error: 'Failed to get projects' });
    }
});

// ============ TASKS ============
app.get('/api/tasks', async (req, res) => {
    try {
        const tasks = await allQuery('SELECT * FROM tasks');
        tasks.forEach(t => {
            try { t.steps = JSON.parse(t.steps); } catch(e) { t.steps = []; }
        });
        res.json({ success: true, tasks });
    } catch (error) {
        console.error('❌ Tasks error:', error);
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

// ============ SETTINGS ============
app.get('/api/settings', async (req, res) => {
    try {
        const settingsRows = await allQuery('SELECT * FROM settings');
        const settings = {};
        settingsRows.forEach(s => settings[s.key] = s.value);
        res.json({ success: true, settings });
    } catch (error) {
        console.error('❌ Settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// ================================================
// ЗАПУСК СЕРВЕРА
// ================================================
async function startServer() {
    try {
        // Инициализируем базу данных
        initDatabase();
        
        // Ждем немного для завершения инициализации
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Инициализируем дефолтные данные
        await initDefaultData();
        
        // Запускаем сервер
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 Server running on port ${PORT}`);
            console.log(`🔑 Admin: attackavgustov@proton.me / l39503950l`);
            console.log(`🌐 API: http://localhost:${PORT}/api`);
            console.log(`📁 Database: ${dbPath}`);
            console.log(`📊 Health: http://localhost:${PORT}/api/health\n`);
        });
    } catch (error) {
        console.error('❌ Server startup error:', error);
        process.exit(1);
    }
}

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Запускаем сервер
startServer();