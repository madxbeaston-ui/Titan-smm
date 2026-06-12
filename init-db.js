const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

async function init() {
  console.log('📦 Initializing database...');

  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    balance REAL DEFAULT 0,
    total_spent REAL DEFAULT 0,
    role TEXT DEFAULT 'user',
    api_key TEXT UNIQUE,
    referral_code TEXT UNIQUE,
    referred_by INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Services table
  db.run(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    rate_per_1000 REAL NOT NULL,
    min_qty INTEGER NOT NULL,
    max_qty INTEGER NOT NULL,
    type TEXT DEFAULT 'default',
    refill_days INTEGER DEFAULT 30,
    status TEXT DEFAULT 'active'
  )`);

  // Orders table
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    link TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    charge REAL NOT NULL,
    remains INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    runs INTEGER DEFAULT 0,
    total_runs INTEGER DEFAULT 0,
    interval_minutes INTEGER DEFAULT 0,
    is_subscription INTEGER DEFAULT 0,
    subscription_frequency TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  )`);

  // Transactions table (Add Funds Requests & History)
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    bonus REAL DEFAULT 0,
    method TEXT,
    status TEXT DEFAULT 'pending',
    type TEXT DEFAULT 'deposit',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Tickets table
  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Ticket replies
  db.run(`CREATE TABLE IF NOT EXISTS ticket_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
  )`);

  // Child panels
  db.run(`CREATE TABLE IF NOT EXISTS child_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    api_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    markup INTEGER DEFAULT 20,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Referral earnings
  db.run(`CREATE TABLE IF NOT EXISTS referral_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('✅ Tables created');

  // Check if admin exists
  db.get("SELECT id FROM users WHERE username = 'admin'", async (err, row) => {
    if (!row) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const apiKey = 'admin_' + Math.random().toString(36).substring(2, 15);
      const refCode = 'ADMIN' + Math.floor(Math.random() * 10000);
      db.run(`INSERT INTO users (username, email, password, role, api_key, referral_code, balance) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['admin', 'admin@titan.com', hashedPassword, 'admin', apiKey, refCode, 9999]);
      console.log('👑 Admin user created: admin / admin123');
    }

    // Create demo user
    db.get("SELECT id FROM users WHERE username = 'demo'", async (err, demoRow) => {
      if (!demoRow) {
        const hashedPassword = await bcrypt.hash('demo123', 10);
        const apiKey = 'demo_' + Math.random().toString(36).substring(2, 15);
        const refCode = 'DEMO' + Math.floor(Math.random() * 10000);
        db.run(`INSERT INTO users (username, email, password, role, api_key, referral_code, balance) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['demo', 'demo@titan.com', hashedPassword, 'user', apiKey, refCode, 100]);
        console.log('👤 Demo user created: demo / demo123');
      }
    });

    // Sample services
    const services = [
      ['Instagram Followers [Real HQ]', 'Instagram', 0.50, 100, 100000, 'default', 30, 'active'],
      ['Instagram Likes [Instant]', 'Instagram', 0.20, 50, 50000, 'default', 30, 'active'],
      ['YouTube Views [Real IP]', 'YouTube', 0.80, 500, 1000000, 'drip-feed', 30, 'active'],
      ['TikTok Followers [Active]', 'TikTok', 0.60, 100, 100000, 'default', 30, 'active'],
      ['Twitter Followers [Real]', 'Twitter', 1.00, 50, 50000, 'default', 30, 'active'],
      ['Facebook Page Likes', 'Facebook', 2.00, 100, 50000, 'package', 30, 'active']
    ];

    db.run("DELETE FROM services"); // Clear old
    const stmt = db.prepare(`INSERT INTO services (name, category, rate_per_1000, min_qty, max_qty, type, refill_days, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (let s of services) {
      stmt.run(s);
    }
    stmt.finalize();
    console.log('🎯 Sample services added');
  });

  db.close();
}

init();