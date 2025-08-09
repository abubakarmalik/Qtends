const express = require('express');
const authRoutes = require('./auth-routes/auth.route');
const productRoutes = require('./product-routes/product.route');
const categoryRoutes = require('./category-routes/category.routes');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);

module.exports = router;
