const express = require('express');
const authenticate = require('../middleware/auth');
const {
  dashboard, getServices, placeOrder, getOrders, cancelOrder, requestRefill,
  addFundsRequest, getBalance, getReferralStats, generateApiKey,
  getChildPanels, addChildPanel, getTickets, createTicket,
  updateProfile, changePassword
} = require('../controllers/userController');

const router = express.Router();

router.get('/dashboard', authenticate, dashboard);
router.get('/services', authenticate, getServices);
router.post('/order', authenticate, placeOrder);
router.get('/orders', authenticate, getOrders);
router.post('/order/:id/cancel', authenticate, cancelOrder);
router.post('/order/:id/refill', authenticate, requestRefill);
router.post('/add-funds', authenticate, addFundsRequest);
router.get('/balance', authenticate, getBalance);
router.get('/referral', authenticate, getReferralStats);
router.post('/api-key/generate', authenticate, generateApiKey);
router.get('/child-panels', authenticate, getChildPanels);
router.post('/child-panels', authenticate, addChildPanel);
router.get('/tickets', authenticate, getTickets);
router.post('/tickets', authenticate, createTicket);
router.put('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);

module.exports = router;