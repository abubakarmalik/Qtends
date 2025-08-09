const express = require('express');
const { requireAuth, requireAdmin } = require('../../middlewares/auth');
const {
  createCategory,
  listCategories,
  tree,
  getCategory,
  listSubcategories,
  updateCategory,
  deleteCategory,
} = require('../../controllers/category-controller/category.controller');

const router = express.Router();

/**
 * PUBLIC routes: anyone can read categories
 */
router.get('/', listCategories);
router.get('/tree', tree);
router.get('/:slug', getCategory);
router.get('/:slug/subcategories', listSubcategories);

// ADMIN
router.post('/', requireAuth, requireAdmin, createCategory); // can create subcategory using parentSlug
router.patch('/:slug', requireAuth, requireAdmin, updateCategory); // can move under parent or top-level
router.delete('/:slug', requireAuth, requireAdmin, deleteCategory);

module.exports = router;
