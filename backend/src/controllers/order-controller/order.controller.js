const { z } = require('zod');
const mongoose = require('mongoose');
const Cart = require('../../models/cart.model');
const Product = require('../../models/product.model');
const Order = require('../../models/order.model');

/** Simple helpers — customize as needed */
function calcShipping(subtotal) {
  // flat 0 for now; e.g., return subtotal > 100 ? 0 : 5;
  return 0;
}
function calcTax(subtotal) {
  // e.g., 0% for now; plug in your region logic later
  return 0;
}

/** Zod: minimal shipping address + method */
const createOrderSchema = z.object({
  shippingAddress: z
    .object({
      fullName: z.string().min(2),
      phone: z.string().min(6),
      address1: z.string().min(3),
      address2: z.string().optional(),
      city: z.string().min(2),
      state: z.string().optional(),
      postalCode: z.string().min(3),
      country: z.string().min(2),
    })
    .optional(),
  paymentMethod: z.enum(['cod']).optional(), // extend later when you add Stripe/PayPal
});

/**
 * POST /api/orders
 * Create an order from the user's cart:
 * - reload products, verify stock
 * - compute totals
 * - use a MongoDB transaction to decrement stock & create the order atomically
 * - clear cart on success
 */
async function createOrder(req, res) {
  const body = createOrderSchema.parse(req.body);

  // Load cart with product refs
  let cart = await Cart.findOne({ user: req.user.id }).populate(
    'items.product',
  );
  if (!cart || cart.items.length === 0) {
    return res.status(400).json({ message: 'Cart is empty' });
  }

  // Build snapshot and compute subtotal using *current* product prices
  let subtotal = 0;
  const itemsSnapshot = [];

  for (const it of cart.items) {
    const p = it.product;
    if (!p || !p.isActive) {
      return res.status(400).json({ message: `Product unavailable in cart` });
    }
    if (p.stock < it.qty) {
      return res
        .status(400)
        .json({ message: `Insufficient stock for ${p.slug}` });
    }
    const lineTotal = +(p.price * it.qty).toFixed(2);
    subtotal += lineTotal;

    itemsSnapshot.push({
      product: p._id,
      title: p.title,
      slug: p.slug,
      price: p.price,
      qty: it.qty,
      lineTotal,
    });
  }

  subtotal = +subtotal.toFixed(2);
  const shippingFee = calcShipping(subtotal);
  const tax = calcTax(subtotal);
  const grandTotal = +(subtotal + shippingFee + tax).toFixed(2);

  // Transaction: decrement stock + create order + clear cart atomically
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Decrement stock
    for (const it of cart.items) {
      const resUpd = await Product.updateOne(
        { _id: it.product._id, stock: { $gte: it.qty } },
        { $inc: { stock: -it.qty } },
        { session },
      );
      if (resUpd.modifiedCount !== 1) {
        throw new Error(`Stock update failed for ${it.product.slug}`);
      }
    }

    // Create order
    const order = await Order.create(
      [
        {
          user: req.user.id,
          items: itemsSnapshot,
          subtotal,
          shippingFee,
          tax,
          grandTotal,
          shippingAddress: body.shippingAddress || {},
          paymentMethod: body.paymentMethod || 'cod',
          paymentStatus: 'unpaid',
          status: 'pending',
        },
      ],
      { session },
    );

    // Clear cart
    cart.items = [];
    await cart.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Return order (array[0] because create with session returns array)
    return res.status(201).json({ order: order[0] });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res
      .status(500)
      .json({ message: err.message || 'Order creation failed' });
  }
}

/** GET /api/orders (auth) — my orders */
async function myOrders(req, res) {
  const orders = await Order.find({ user: req.user.id }).sort({
    createdAt: -1,
  });
  res.json({ items: orders });
}

/** GET /api/orders/:id (auth) — user can see own; admin can see any */
async function getOrder(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Not found' });

  const isOwner = String(order.user) === String(req.user.id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin)
    return res.status(403).json({ message: 'Forbidden' });

  res.json({ order });
}

/** ADMIN: GET /api/orders/all — list all */
async function listAllOrders(_req, res) {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json({ items: orders });
}

/** ADMIN: PATCH /api/orders/:id/status — update status (paid/shipped/delivered) */
const updateStatusSchema = z.object({
  status: z.enum(['pending', 'paid', 'shipped', 'delivered']).optional(),
  paymentStatus: z.enum(['unpaid', 'paid', 'refunded']).optional(),
});

async function updateOrderStatus(req, res) {
  const data = updateStatusSchema.parse(req.body);
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Not found' });

  if (data.status) order.status = data.status;
  if (data.paymentStatus) order.paymentStatus = data.paymentStatus;
  await order.save();

  res.json({ order });
}

/**
 * DELETE /api/orders/:id (auth) — cancel if pending & unpaid.
 * Restores stock in a transaction.
 */
async function cancelMyOrder(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Not found' });

  const isOwner = String(order.user) === String(req.user.id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin)
    return res.status(403).json({ message: 'Forbidden' });

  if (order.cancelled)
    return res.status(400).json({ message: 'Already cancelled' });
  if (order.paymentStatus !== 'unpaid' || order.status !== 'pending') {
    return res
      .status(400)
      .json({ message: 'Cannot cancel after payment or processing' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Restore stock
    for (const it of order.items) {
      await Product.updateOne(
        { _id: it.product },
        { $inc: { stock: +it.qty } },
        { session },
      );
    }

    order.cancelled = true;
    order.cancelledAt = new Date();
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ ok: true });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Cancel failed' });
  }
}

module.exports = {
  createOrder,
  myOrders,
  getOrder,
  listAllOrders,
  updateOrderStatus,
  cancelMyOrder,
};
