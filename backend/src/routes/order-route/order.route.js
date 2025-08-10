const express = require('express');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const {
  createOrder,
  myOrders,
  getOrder,
  listAllOrders,
  updateOrderStatus,
  cancelMyOrder,
} = require('../../controllers/order-controller/order.controller');

const router = express.Router();

// User
router.post('/', requireAuth, createOrder); // POST /api/orders
router.get('/', requireAuth, myOrders); // GET  /api/orders
router.get('/:id', requireAuth, getOrder); // GET  /api/orders/:id
router.delete('/:id', requireAuth, cancelMyOrder); // DELETE /api/orders/:id (cancel if pending+unpaid)

// Admin
router.get('/admin/all', requireAuth, requireAdmin, listAllOrders); // GET /api/orders/admin/all
router.patch('/:id/status', requireAuth, requireAdmin, updateOrderStatus); // PATCH /api/orders/:id/status

module.exports = router;
