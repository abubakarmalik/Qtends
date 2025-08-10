const express = require('express');
const { requireAuth } = require('../../middlewares/auth');
const {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
} = require('../../controllers/cart-controller/cart.controller');

const router = express.Router();

router.use(requireAuth); // all cart routes require login

router.get('/', getCart); // GET /api/cart
router.post('/items', addItem); // POST /api/cart/items
router.patch('/items/:productSlug', updateItem); // PATCH /api/cart/items/:productSlug
router.delete('/items/:productSlug', removeItem); // DELETE /api/cart/items/:productSlug
router.delete('/', clearCart); // DELETE /api/cart

module.exports = router;
