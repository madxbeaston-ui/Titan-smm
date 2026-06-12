require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// =============================================
//   TITAN SMM PANEL — server.js (Fixed)
//   Bugs Fixed:
//   1. server.json → server.js (rename)
//   2. Middleware → middleware (folder rename)
//   3. /api/user/* routes correctly mapped
//   4. Helmet CSP disabled for HTML to work
// =============================================

const authRoutes  = require('./routes/auth');
const userRoutes  = require('./routes/user');
const adminRoutes = require('./routes/admin');

const app = express();

// ── Security ──────────────────────────────────
// CSP off rakha hai taake HTML files CDN (FontAwesome, Google Fonts) load ho sakein
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ──────────────────────────────
// Login par strict limit — brute force se bachao
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 login attempts
  message: { error: 'Bahut zyada login attempts. 15 minute baad try karo.' }
});

// General API limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/auth/login',    loginLimiter);
app.use('/api/auth/register', loginLimiter);
app.use('/api/',              apiLimiter);

// ── Static Files ───────────────────────────────
// public/ folder se user.html aur admin.html serve hoga
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────
app.use('/api/auth',       authRoutes);   // /api/auth/login, /register, /me
app.use('/api/user',       userRoutes);   // /api/user/dashboard, /orders, etc.
app.use('/api/admin',      adminRoutes);  // /api/admin/stats, /users, etc.

// ── Root redirect ─────────────────────────────
// domain.com/ kholo to user panel pe jao
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// ── 404 Handler ───────────────────────────────
app.use((req, res) => {
  // Agar HTML page request hai to user.html de do (SPA behavior)
  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'public', 'user.html'));
  }
  res.status(404).json({ error: 'API endpoint not found' });
});

// ── Global Error Handler ──────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ──────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('');
  console.log('⚡ ================================');
  console.log(`   TITAN SMM PANEL STARTED`);
  console.log('   ================================');
  console.log(`   🌐 URL:   http://localhost:${PORT}`);
  console.log(`   👤 User:  http://localhost:${PORT}/user.html`);
  console.log(`   🛡️  Admin: http://localhost:${PORT}/admin.html`);
  console.log('   ================================');
  console.log('');
});
