const db = require('../models/database');

// Get dashboard stats
exports.dashboard = async (req, res) => {
  const userId = req.user.id;
  try {
    const totalOrders = await db.getAsync('SELECT COUNT(*) as count FROM orders WHERE user_id = ?', [userId]);
    const completed = await db.getAsync('SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status = "completed"', [userId]);
    const balance = req.user.balance;
    const totalSpent = await db.getAsync('SELECT SUM(charge) as spent FROM orders WHERE user_id = ?', [userId]);
    res.json({
      totalOrders: totalOrders.count,
      completed: completed.count,
      balance: balance,
      totalSpent: totalSpent.spent || 0,
      referralEarnings: await db.getAsync('SELECT SUM(amount) as total FROM referral_earnings WHERE user_id = ?', [userId])
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

// List all services
exports.getServices = async (req, res) => {
  try {
    const services = await db.allAsync('SELECT * FROM services WHERE status = "active" ORDER BY category, name');
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
};

// Place an order
exports.placeOrder = async (req, res) => {
  const { service_id, link, quantity, runs, interval_minutes, is_subscription, subscription_frequency } = req.body;
  const userId = req.user.id;

  if (!service_id || !link || !quantity) {
    return res.status(400).json({ error: 'Service ID, link, and quantity required' });
  }

  try {
    const service = await db.getAsync('SELECT * FROM services WHERE id = ? AND status = "active"', [service_id]);
    if (!service) return res.status(400).json({ error: 'Service not found' });

    if (quantity < service.min_qty || quantity > service.max_qty) {
      return res.status(400).json({ error: `Quantity must be between ${service.min_qty} and ${service.max_qty}` });
    }

    const charge = (quantity / 1000) * service.rate_per_1000;
    if (req.user.balance < charge) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct balance
    await db.runAsync('UPDATE users SET balance = balance - ?, total_spent = total_spent + ? WHERE id = ?', [charge, charge, userId]);

    const runsCount = runs ? parseInt(runs) : 0;
    const interval = interval_minutes ? parseInt(interval_minutes) : 0;
    const isSub = is_subscription ? 1 : 0;

    const result = await db.runAsync(
      `INSERT INTO orders (user_id, service_id, link, quantity, charge, remains, runs, total_runs, interval_minutes, is_subscription, subscription_frequency, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, service_id, link, quantity, charge, runsCount > 0 ? quantity : 0, runsCount, runsCount, interval, isSub, subscription_frequency || null, 'pending']
    );

    // Handle referral commission
    const user = await db.getAsync('SELECT referred_by FROM users WHERE id = ?', [userId]);
    if (user && user.referred_by) {
      const commission = charge * 0.05;
      await db.runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [commission, user.referred_by]);
      await db.runAsync('INSERT INTO referral_earnings (user_id, from_user_id, order_id, amount) VALUES (?, ?, ?, ?)',
        [user.referred_by, userId, result.lastID, commission]);
    }

    res.json({ order_id: result.lastID, charge, status: 'pending', message: 'Order placed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Order failed' });
  }
};

// Get user orders
exports.getOrders = async (req, res) => {
  const userId = req.user.id;
  const { status, search } = req.query;
  let sql = 'SELECT o.*, s.name as service_name FROM orders o JOIN services s ON o.service_id = s.id WHERE o.user_id = ?';
  let params = [userId];
  if (status && status !== 'all') {
    sql += ' AND o.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (o.link LIKE ? OR o.id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY o.created_at DESC';
  try {
    const orders = await db.allAsync(sql, params);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

// Cancel order (if pending)
exports.cancelOrder = async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id;
  try {
    const order = await db.getAsync('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending orders can be cancelled' });
    }
    // Refund
    await db.runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [order.charge, userId]);
    await db.runAsync('UPDATE orders SET status = "cancelled" WHERE id = ?', [orderId]);
    res.json({ message: 'Order cancelled and refunded' });
  } catch (err) {
    res.status(500).json({ error: 'Cancellation failed' });
  }
};

// Request refill
exports.requestRefill = async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id;
  try {
    const order = await db.getAsync('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    // Simulate refill request (in real panel, you'd notify admin)
    res.json({ message: 'Refill request submitted, admin will review' });
  } catch (err) {
    res.status(500).json({ error: 'Refill request failed' });
  }
};

// Add funds request (user initiates)
exports.addFundsRequest = async (req, res) => {
  const { amount, method } = req.body;
  const userId = req.user.id;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Minimum amount $1' });

  let bonus = 0;
  if (amount >= 250) bonus = amount * 0.18;
  else if (amount >= 100) bonus = amount * 0.12;
  else if (amount >= 50) bonus = amount * 0.08;
  else if (amount >= 25) bonus = amount * 0.05;
  else if (amount >= 10) bonus = amount * 0.02;

  const total = amount + bonus;
  try {
    await db.runAsync(
      'INSERT INTO transactions (user_id, amount, bonus, method, status, type) VALUES (?, ?, ?, ?, "pending", "deposit")',
      [userId, amount, bonus, method]
    );
    res.json({ message: 'Fund request submitted. Awaiting admin approval.', requested: amount, bonus, total });
  } catch (err) {
    res.status(500).json({ error: 'Request failed' });
  }
};

// Get user balance & history
exports.getBalance = async (req, res) => {
  const userId = req.user.id;
  try {
    const user = await db.getAsync('SELECT balance, total_spent FROM users WHERE id = ?', [userId]);
    const transactions = await db.allAsync('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);
    res.json({ balance: user.balance, total_spent: user.total_spent, transactions });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Referral stats
exports.getReferralStats = async (req, res) => {
  const userId = req.user.id;
  try {
    const referrals = await db.allAsync('SELECT id, username, created_at FROM users WHERE referred_by = ?', [userId]);
    const earnings = await db.getAsync('SELECT SUM(amount) as total FROM referral_earnings WHERE user_id = ?', [userId]);
    const user = await db.getAsync('SELECT referral_code FROM users WHERE id = ?', [userId]);
    res.json({
      referral_code: user.referral_code,
      total_referrals: referrals.length,
      total_earned: earnings.total || 0,
      referrals_list: referrals
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Generate new API key
exports.generateApiKey = async (req, res) => {
  const userId = req.user.id;
  const newKey = 'tk_' + Math.random().toString(36).substring(2, 25);
  try {
    await db.runAsync('UPDATE users SET api_key = ? WHERE id = ?', [newKey, userId]);
    res.json({ api_key: newKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate key' });
  }
};

// Child panels CRUD
exports.getChildPanels = async (req, res) => {
  const userId = req.user.id;
  try {
    const panels = await db.allAsync('SELECT * FROM child_panels WHERE user_id = ?', [userId]);
    res.json(panels);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.addChildPanel = async (req, res) => {
  const { name, api_url, api_key, markup } = req.body;
  const userId = req.user.id;
  if (!name || !api_url || !api_key) return res.status(400).json({ error: 'Name, URL, and API key required' });
  try {
    const result = await db.runAsync(
      'INSERT INTO child_panels (user_id, name, api_url, api_key, markup) VALUES (?, ?, ?, ?, ?)',
      [userId, name, api_url, api_key, markup || 20]
    );
    res.json({ id: result.lastID, message: 'Child panel added' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add' });
  }
};

// Tickets
exports.getTickets = async (req, res) => {
  const userId = req.user.id;
  try {
    const tickets = await db.allAsync('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.createTicket = async (req, res) => {
  const { subject, message } = req.body;
  const userId = req.user.id;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message required' });
  try {
    const result = await db.runAsync(
      'INSERT INTO tickets (user_id, subject, message) VALUES (?, ?, ?)',
      [userId, subject, message]
    );
    res.json({ ticket_id: result.lastID, message: 'Ticket created' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.updateProfile = async (req, res) => {
  const { username, email } = req.body;
  const userId = req.user.id;
  try {
    await db.runAsync('UPDATE users SET username = ?, email = ? WHERE id = ?', [username, email, userId]);
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
};

exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  const userId = req.user.id;
  const bcrypt = require('bcryptjs');
  try {
    const user = await db.getAsync('SELECT password FROM users WHERE id = ?', [userId]);
    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
    const hashed = await bcrypt.hash(new_password, 10);
    await db.runAsync('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};