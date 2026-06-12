const express = require('express');
const authenticate = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const {
  getStats, getUsers, updateUser, resetUserPassword, deleteUser,
  getServices, createService, updateService, deleteService,
  getAllOrders, updateOrderStatus,
  getPendingFunds, approveFunds, rejectFunds,
  getAllTickets, replyTicket, closeTicket,
  getSettings, backupDatabase
} = require('../controllers/adminController');

const router = express.Router();

// All admin routes require auth + admin role
router.use(authenticate, adminOnly);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.put('/users/:userId', updateUser);
router.post('/users/:userId/reset-password', resetUserPassword);
router.delete('/users/:userId', deleteUser);

router.get('/services', getServices);
router.post('/services', createService);
router.put('/services/:serviceId', updateService);
router.delete('/services/:serviceId', deleteService);

router.get('/orders', getAllOrders);
router.put('/orders/:orderId/status', updateOrderStatus);

router.get('/funds/pending', getPendingFunds);
router.post('/funds/:transactionId/approve', approveFunds);
router.post('/funds/:transactionId/reject', rejectFunds);

router.get('/tickets', getAllTickets);
router.post('/tickets/:ticketId/reply', replyTicket);
router.post('/tickets/:ticketId/close', closeTicket);

router.get('/settings', getSettings);
router.post('/backup', backupDatabase);

module.exports = router;