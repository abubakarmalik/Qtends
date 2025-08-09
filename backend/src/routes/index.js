const express = require('express');
const authRoutes = require('./authRoutes/auth.route');
const productRoutes = require('./productRoutes/product.route');
const categoryRoutes = require('./categoryRoutes/category.routes');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);

module.exports = router;
