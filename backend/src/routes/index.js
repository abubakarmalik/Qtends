const express = require('express');
const authRoutes = require('./auth-routes/auth.route');
const productRoutes = require('./product-routes/product.route');
const categoryRoutes = require('./category-routes/category.routes');
const cartRoutes = require('./cart-routes/cart.route');
const orderRoutes = require('./order-route/order.route');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);

module.exports = router;
