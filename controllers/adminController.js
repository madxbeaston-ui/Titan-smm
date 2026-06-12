const db = require('../models/database');
const bcrypt = require('bcryptjs');

// Dashboard stats
exports.getStats = async (req, res) => {
  try {
    const totalUsers = await db.getAsync('SELECT COUNT(*) as count FROM users');
    const totalOrders = await db.getAsync('SELECT COUNT(*) as count FROM orders');
    const totalRevenue = await db.getAsync('SELECT SUM(charge) as total FROM orders WHERE status = "completed"');
    const pendingOrders = await db.getAsync('SELECT COUNT(*) as count FROM orders WHERE status = "pending"');
    const pendingFunds = await db.getAsync('SELECT COUNT(*) as count FROM transactions WHERE status = "pending" AND type = "deposit"');
    res.json({
      totalUsers: totalUsers.count,
      totalOrders: totalOrders.count,
      totalRevenue: totalRevenue.total || 0,
      pendingOrders: pendingOrders.count,
      pendingFunds: pendingFunds.count
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const users = await db.allAsync('SELECT id, username, email, balance, total_spent, role, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Update user balance, role, etc.
exports.updateUser = async (req, res) => {
  const { userId } = req.params;
  const { balance, role } = req.body;
  try {
    if (balance !== undefined) {
      await db.runAsync('UPDATE users SET balance = ? WHERE id = ?', [balance, userId]);
    }
    if (role) {
      await db.runAsync('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    }
    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Reset user password
exports.resetUserPassword = async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;
  const hashed = await bcrypt.hash(newPassword, 10);
  try {
    await db.runAsync('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ message: 'Password reset' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  const { userId } = req.params;
  try {
    await db.runAsync('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Services CRUD
exports.getServices = async (req, res) => {
  try {
    const services = await db.allAsync('SELECT * FROM services ORDER BY category, name');
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.createService = async (req, res) => {
  const { name, category, rate_per_1000, min_qty, max_qty, type, refill_days } = req.body;
  try {
    const result = await db.runAsync(
      `INSERT INTO services (name, category, rate_per_1000, min_qty, max_qty, type, refill_days) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, category, rate_per_1000, min_qty, max_qty, type || 'default', refill_days || 30]
    );
    res.json({ id: result.lastID, message: 'Service created' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.updateService = async (req, res) => {
  const { serviceId } = req.params;
  const updates = req.body;
  try {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    await db.runAsync(`UPDATE services SET ${fields} WHERE id = ?`, [...values, serviceId]);
    res.json({ message: 'Service updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.deleteService = async (req, res) => {
  const { serviceId } = req.params;
  try {
    await db.runAsync('DELETE FROM services WHERE id = ?', [serviceId]);
    res.json({ message: 'Service deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Orders (admin view)
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await db.allAsync(`
      SELECT o.*, u.username, s.name as service_name 
      FROM orders o 
      JOIN users u ON o.user_id = u.id 
      JOIN services s ON o.service_id = s.id 
      ORDER BY o.created_at DESC
    `);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  try {
    await db.runAsync('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
    res.json({ message: 'Order status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Approve fund request
exports.getPendingFunds = async (req, res) => {
  try {
    const pending = await db.allAsync(`
      SELECT t.*, u.username 
      FROM transactions t 
      JOIN users u ON t.user_id = u.id 
      WHERE t.status = 'pending' AND t.type = 'deposit'
      ORDER BY t.created_at ASC
    `);
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.approveFunds = async (req, res) => {
  const { transactionId } = req.params;
  try {
    const trans = await db.getAsync('SELECT * FROM transactions WHERE id = ?', [transactionId]);
    if (!trans) return res.status(404).json({ error: 'Transaction not found' });
    const total = trans.amount + (trans.bonus || 0);
    await db.runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [total, trans.user_id]);
    await db.runAsync('UPDATE transactions SET status = "approved" WHERE id = ?', [transactionId]);
    res.json({ message: 'Funds added to user' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.rejectFunds = async (req, res) => {
  const { transactionId } = req.params;
  try {
    await db.runAsync('UPDATE transactions SET status = "rejected" WHERE id = ?', [transactionId]);
    res.json({ message: 'Fund request rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Support tickets
exports.getAllTickets = async (req, res) => {
  try {
    const tickets = await db.allAsync(`
      SELECT t.*, u.username 
      FROM tickets t 
      JOIN users u ON t.user_id = u.id 
      ORDER BY t.created_at DESC
    `);
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.replyTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { message } = req.body;
  const adminId = req.user.id;
  try {
    await db.runAsync(
      'INSERT INTO ticket_replies (ticket_id, user_id, message, is_admin) VALUES (?, ?, ?, 1)',
      [ticketId, adminId, message]
    );
    await db.runAsync('UPDATE tickets SET status = "answered" WHERE id = ?', [ticketId]);
    res.json({ message: 'Reply sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.closeTicket = async (req, res) => {
  const { ticketId } = req.params;
  try {
    await db.runAsync('UPDATE tickets SET status = "closed" WHERE id = ?', [ticketId]);
    res.json({ message: 'Ticket closed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
};

// System settings (global)
exports.getSettings = async (req, res) => {
  // For simplicity, return hardcoded or you can create a settings table
  res.json({
    site_name: 'Titan SMM Panel',
    min_order: 1,
    max_order: 100000,
    referral_commission: 5,
    currency: 'USD'
  });
};

// Database backup (simple SQL dump)
exports.backupDatabase = async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const backupPath = path.join(__dirname, '..', 'backup.sql');
  db.allAsync("SELECT sql FROM sqlite_master WHERE type='table'").then(tables => {
    let dump = '';
    // This is a simplified backup; for real use, use sqlite3 command line
    res.json({ message: 'Backup feature - use sqlite3 command line for full dump' });
  });
};