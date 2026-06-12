const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/database');

exports.register = async (req, res) => {
  const { username, email, password, referral_code } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const existing = await db.getAsync('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) return res.status(400).json({ error: 'Username or email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const apiKey = 'user_' + Math.random().toString(36).substring(2, 20);
    const refCode = username.toUpperCase() + Math.floor(Math.random() * 10000);

    let referredBy = null;
    if (referral_code) {
      const referrer = await db.getAsync('SELECT id FROM users WHERE referral_code = ?', [referral_code]);
      if (referrer) referredBy = referrer.id;
    }

    const result = await db.runAsync(
      `INSERT INTO users (username, email, password, api_key, referral_code, referred_by, balance) VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [username, email, hashedPassword, apiKey, refCode, referredBy]
    );

    const token = jwt.sign({ id: result.lastID, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: result.lastID, username, email, role: 'user', balance: 0 } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const user = await db.getAsync('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        api_key: user.api_key,
        referral_code: user.referral_code
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.me = async (req, res) => {
  res.json(req.user);
};