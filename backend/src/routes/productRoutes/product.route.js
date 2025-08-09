const express = require('express');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../../controllers/productController/product.controller');

const router = express.Router();

router.get('/', listProducts);
router.get('/:slug', getProduct);

router.post('/', requireAuth, requireAdmin, createProduct);
router.patch('/:slug', requireAuth, requireAdmin, updateProduct);
router.delete('/:slug', requireAuth, requireAdmin, deleteProduct);

module.exports = router;
