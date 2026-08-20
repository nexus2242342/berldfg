// ============================================
// PROFIT HOUSE - ПОЛНЫЙ БЭКЕНД
// ============================================

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'profit_house_secret_2026_super_secure_key';

// ============================================
// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
// ============================================

async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 Initializing database...');

    // Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        balance DECIMAL(15,2) DEFAULT 0,
        total_invested DECIMAL(15,2) DEFAULT 0,
        ref_code VARCHAR(20) UNIQUE,
        referred_by VARCHAR(50),
        role VARCHAR(20) DEFAULT 'user',
        status VARCHAR(20) DEFAULT 'active',
        task_completed JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Investments
    await client.query(`
      CREATE TABLE IF NOT EXISTS investments (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        project_id VARCHAR(50),
        project_title VARCHAR(200),
        amount DECIMAL(15,2) NOT NULL,
        invested DECIMAL(15,2) NOT NULL,
        withdrawn DECIMAL(15,2) DEFAULT 0,
        roi INTEGER DEFAULT 10,
        status VARCHAR(20) DEFAULT 'active',
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        amount VARCHAR(50) NOT NULL,
        method VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Withdrawals
    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        user_name VARCHAR(100),
        amount VARCHAR(50) NOT NULL,
        method VARCHAR(50) NOT NULL,
        address TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Projects
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        min_amount VARCHAR(50),
        profit VARCHAR(50),
        risk VARCHAR(50),
        duration VARCHAR(50),
        image TEXT,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Funds
    await client.query(`
      CREATE TABLE IF NOT EXISTS funds (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        min DECIMAL(15,2),
        roi DECIMAL(5,2),
        task TEXT,
        status VARCHAR(20) DEFAULT 'active'
      )
    `);

    // Tasks
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        bonus DECIMAL(5,2) DEFAULT 0.5,
        type VARCHAR(20) DEFAULT 'daily',
        steps TEXT[],
        status VARCHAR(20) DEFAULT 'active'
      )
    `);

    // Daily Projects
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_projects (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        profit VARCHAR(50),
        bonus DECIMAL(5,2),
        image TEXT,
        date DATE DEFAULT CURRENT_DATE
      )
    `);

    // Daily Tasks
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        bonus DECIMAL(5,2) DEFAULT 0.5,
        steps TEXT[],
        date DATE DEFAULT CURRENT_DATE
      )
    `);

    // Feedback
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(100),
        message TEXT NOT NULL,
        rating INTEGER DEFAULT 5,
        status VARCHAR(20) DEFAULT 'pending',
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables created');

    // ============================================
    // ДЕФОЛТНЫЕ ДАННЫЕ
    // ============================================

    // Create admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'attackavgustov@proton.me';
    const adminPassword = process.env.ADMIN_PASSWORD || 'l39503950l';
    
    const adminCheck = await client.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const adminId = 'admin_' + Date.now();
      await client.query(`
        INSERT INTO users (id, name, email, password, role, ref_code, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [adminId, 'Admin', adminEmail, hashedPassword, 'admin', 'ADMIN001', 'active']);
      console.log('✅ Admin user created');
    }

    // Default settings
    const settingsCheck = await client.query('SELECT * FROM settings WHERE key = $1', ['payment_settings']);
    if (settingsCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO settings (key, value) VALUES 
        ('payment_settings', '{"ton":"UQBIN3fAThhmWe8m2_BM_pEA2PPrBN4r7_Oj16vN0rkfS94a","usdt":"TNp3epj1ReAxkHSXjpVwvDYP78i4cRbEAH","bank":"Raiffeisen Bank\\n123-456-789\\nSWIFT: RAIFFEIS"}'),
        ('site_settings', '{"name":"Profit House","currency":"RSD","min_deposit":12000,"max_deposit":160000,"min_withdraw":6000,"withdraw_fee":12,"early_fee":25,"cycle_days":14,"payout_hours":72}')
      `);
      console.log('✅ Default settings inserted');
    }

    // Default projects
    const projectsCheck = await client.query('SELECT * FROM projects LIMIT 1');
    if (projectsCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO projects (title, description, min_amount, profit, risk, duration, image, status) VALUES 
        ('Hosting Pro', 'Premium web hosting infrastructure investment with guaranteed returns', '12,000 RSD', '10% ROI', 'Level 1', '14 days', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop', 'active'),
        ('Cloud Server', 'Cloud server infrastructure expansion for enterprise clients', '20,000 RSD', '25% ROI', 'Level 2', '14 days', 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=400&fit=crop', 'active'),
        ('Data Center', 'Data center infrastructure investment with maximum returns', '30,000 RSD', '35% ROI', 'Level 3', '14 days', 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=600&h=400&fit=crop', 'active')
      `);
      console.log('✅ Default projects inserted');
    }

    // Default funds
    const fundsCheck = await client.query('SELECT * FROM funds LIMIT 1');
    if (fundsCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO funds (id, name, min, roi, task, status) VALUES 
        ('fund_001', 'Hosting Fund', 12000, 2.5, 'Complete daily tasks for bonus ROI', 'active'),
        ('fund_002', 'Cloud Fund', 20000, 3.0, 'Share our platform on social media', 'active'),
        ('fund_003', 'Data Fund', 30000, 3.5, 'Refer a friend and get bonus', 'active')
      `);
      console.log('✅ Default funds inserted');
    }

    // Default tasks
    const tasksCheck = await client.query('SELECT * FROM tasks LIMIT 1');
    if (tasksCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO tasks (id, title, description, bonus, type, steps, status) VALUES 
        ('task_001', 'Social Media Share', 'Share our project on Twitter/X and earn bonus ROI', 0.5, 'daily', ARRAY['Open Twitter/X', 'Share the latest post', 'Take a screenshot of your share'], 'active'),
        ('task_002', 'Telegram Channel', 'Join our Telegram channel and stay updated', 0.3, 'daily', ARRAY['Open Telegram', 'Join the channel', 'Take a screenshot of your membership'], 'active'),
        ('task_003', 'Daily Check-in', 'Visit your cabinet and check your investment stats', 0.2, 'daily', ARRAY['Login to your cabinet', 'View your balance', 'Check active investments'], 'active')
      `);
      console.log('✅ Default tasks inserted');
    }

    // Default daily tasks
    const dailyTasksCheck = await client.query('SELECT * FROM daily_tasks LIMIT 1');
    if (dailyTasksCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO daily_tasks (title, description, bonus, steps, date) VALUES 
        ('📱 Daily Check-in', 'Visit your cabinet and check stats', 0.3, ARRAY['Login to cabinet', 'Check your balance', 'Complete the task'], CURRENT_DATE),
        ('📢 Share & Earn', 'Share our platform on social media', 0.5, ARRAY['Open social media', 'Share the platform', 'Take a screenshot'], CURRENT_DATE)
      `);
      console.log('✅ Default daily tasks inserted');
    }

    console.log('✅ Database initialized successfully');
    console.log(`📧 Admin: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);

  } catch (error) {
    console.error('❌ Database init error:', error);
  } finally {
    client.release();
  }
}

// ============================================
// МИДЛВЭРЫ
// ============================================

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function isAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ============================================
// API ROUTES
// ============================================

// ----- ПУБЛИЧНЫЕ МАРШРУТЫ -----

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register
app.post('/api/register', async (req, res) => {
  const { name, email, password, referralCode } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const refCode = userId.substring(0, 8).toUpperCase();

    const result = await pool.query(`
      INSERT INTO users (id, name, email, password, ref_code, referred_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, role, balance, ref_code
    `, [userId, name, email, hashedPassword, refCode, referralCode || null]);

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: parseFloat(user.balance),
        refCode: user.ref_code,
        taskCompleted: {}
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
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
        balance: parseFloat(user.balance),
        totalInvested: parseFloat(user.total_invested),
        refCode: user.ref_code,
        taskCompleted: user.task_completed || {}
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get settings (public)
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// ----- ЗАЩИЩЕННЫЕ МАРШРУТЫ -----

// Verify token
app.get('/api/verify', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role, balance, total_invested, ref_code, task_completed FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: parseFloat(user.balance),
        totalInvested: parseFloat(user.total_invested),
        refCode: user.ref_code,
        taskCompleted: user.task_completed || {}
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Get investments
app.get('/api/investments', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM investments WHERE user_id = $1 ORDER BY date DESC', [req.user.id]);
    res.json({ success: true, investments: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get investments' });
  }
});

// Get transactions
app.get('/api/transactions', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC', [req.user.id]);
    res.json({ success: true, transactions: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Get referrals
app.get('/api/users/:id/referrals', authenticate, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT ref_code FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const refCode = userResult.rows[0].ref_code;

    const direct = await pool.query('SELECT * FROM users WHERE referred_by = $1', [refCode]);
    const level2 = await pool.query(`
      SELECT u.* FROM users u 
      WHERE u.referred_by IN (SELECT ref_code FROM users WHERE referred_by = $1)
    `, [refCode]);
    const level3 = await pool.query(`
      SELECT u.* FROM users u 
      WHERE u.referred_by IN (
        SELECT ref_code FROM users 
        WHERE referred_by IN (SELECT ref_code FROM users WHERE referred_by = $1)
      )
    `, [refCode]);

    res.json({
      success: true,
      direct: direct.rows.length,
      level2: level2.rows.length,
      level3: level3.rows.length
    });
  } catch (error) {
    console.error('Referrals error:', error);
    res.status(500).json({ error: 'Failed to get referrals' });
  }
});

// Create transaction
app.post('/api/transactions', authenticate, async (req, res) => {
  const { type, amount, method, status = 'pending' } = req.body;
  try {
    const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    await pool.query(`
      INSERT INTO transactions (id, user_id, type, amount, method, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, req.user.id, type, amount, method, status]);
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add transaction' });
  }
});

// Create investment
app.post('/api/investments', authenticate, async (req, res) => {
  const { projectId, projectTitle, amount, invested, roi } = req.body;
  try {
    const id = 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    await pool.query(`
      INSERT INTO investments (id, user_id, project_id, project_title, amount, invested, roi)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, req.user.id, projectId, projectTitle, amount, invested, roi || 10]);

    // Update user's total invested
    await pool.query('UPDATE users SET total_invested = total_invested + $1 WHERE id = $2', [parseFloat(invested), req.user.id]);

    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add investment' });
  }
});

// Update user (for balance changes)
app.put('/api/users/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { balance, totalInvested, status } = req.body;
  
  // Check if user is updating themselves or is admin
  if (req.user.id !== id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const updates = [];
    const values = [];
    let idx = 1;
    
    if (balance !== undefined) { 
      updates.push(`balance = $${idx++}`); 
      values.push(balance); 
    }
    if (totalInvested !== undefined) { 
      updates.push(`total_invested = $${idx++}`); 
      values.push(totalInvested); 
    }
    if (status !== undefined && req.user.role === 'admin') { 
      updates.push(`status = $${idx++}`); 
      values.push(status); 
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Sync - get all data
app.get('/api/sync', authenticate, async (req, res) => {
  try {
    const projects = await pool.query('SELECT * FROM projects WHERE status = $1 ORDER BY created_at DESC', ['active']);
    const funds = await pool.query('SELECT * FROM funds WHERE status = $1', ['active']);
    const tasks = await pool.query('SELECT * FROM tasks WHERE status = $1', ['active']);
    const dailyProjects = await pool.query('SELECT * FROM daily_projects WHERE date = CURRENT_DATE');
    const dailyTasks = await pool.query('SELECT * FROM daily_tasks WHERE date = CURRENT_DATE');
    const feedback = await pool.query('SELECT * FROM feedback ORDER BY date DESC LIMIT 50');
    const withdrawals = await pool.query('SELECT * FROM withdrawals WHERE status = $1 ORDER BY date DESC', ['pending']);
    const transactions = await pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC LIMIT 100', [req.user.id]);
    const investments = await pool.query('SELECT * FROM investments WHERE user_id = $1 ORDER BY date DESC', [req.user.id]);

    res.json({
      success: true,
      data: {
        projects: projects.rows,
        funds: funds.rows,
        tasks: tasks.rows,
        dailyProjects: dailyProjects.rows,
        dailyTasks: dailyTasks.rows,
        feedback: feedback.rows,
        withdrawals: withdrawals.rows,
        transactions: transactions.rows,
        investments: investments.rows
      }
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// ----- АДМИНСКИЕ МАРШРУТЫ -----

// Get all users
app.get('/api/users', authenticate, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, balance, role, status, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, users: result.rows.map(u => ({ ...u, balance: parseFloat(u.balance) })) });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Update user (admin full access)
app.put('/api/users/:id', authenticate, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { balance, status, totalInvested } = req.body;
  try {
    const updates = [];
    const values = [];
    let idx = 1;
    if (balance !== undefined) { updates.push(`balance = $${idx++}`); values.push(balance); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (totalInvested !== undefined) { updates.push(`total_invested = $${idx++}`); values.push(totalInvested); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Update settings (admin)
app.put('/api/settings', authenticate, isAdmin, async (req, res) => {
  const { key, value } = req.body;
  if (!key || !value) {
    return res.status(400).json({ error: 'Key and value required' });
  }
  try {
    await pool.query(`
      INSERT INTO settings (key, value) VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `, [key, value]);
    res.json({ success: true });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================

// Функция для graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Инициализация и запуск
initDatabase().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Profit House API running on port ${port}`);
    console.log(`🔗 URL: http://localhost:${port}`);
    console.log(`📧 Admin: ${process.env.ADMIN_EMAIL || 'attackavgustov@proton.me'}`);
    console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'l39503950l'}`);
    console.log('✅ Server is ready!');
  });
}).catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
