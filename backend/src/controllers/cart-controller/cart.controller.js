const { z } = require('zod');
const Cart = require('../../models/cart.model');
const Product = require('../../models/product.model');

/** Ensure a cart exists for a user */
async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId }).populate(
    'items.product',
    'title slug price stock',
  );
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
    cart = await cart.populate('items.product', 'title slug price stock');
  }
  return cart;
}

/** Compute totals using *current* product prices */
function computeTotals(cart) {
  const items = cart.items.map((i) => ({
    slug: i.product.slug,
    title: i.product.title,
    price: i.product.price,
    stock: i.product.stock,
    qty: i.qty,
    lineTotal: +(i.product.price * i.qty).toFixed(2),
  }));
  const subtotal = +items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);
  return { items, subtotal };
}

/** GET /api/cart (auth) */
async function getCart(req, res) {
  const cart = await getOrCreateCart(req.user.id);
  const totals = computeTotals(cart);
  res.json({ cart: { items: totals.items }, subtotal: totals.subtotal });
}

/** POST /api/cart/items (auth)  body: { productSlug, qty } */
const addSchema = z.object({
  productSlug: z.string().min(1),
  qty: z.number().int().min(1).max(999),
});

async function addItem(req, res) {
  const { productSlug, qty } = addSchema.parse(req.body);

  const product = await Product.findOne({ slug: productSlug, isActive: true });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  if (product.stock < 1)
    return res.status(400).json({ message: 'Out of stock' });

  const cart = await getOrCreateCart(req.user.id);

  const idx = cart.items.findIndex(
    (i) => String(i.product._id) === String(product._id),
  );
  if (idx >= 0) {
    const newQty = cart.items[idx].qty + qty;
    if (newQty > product.stock)
      return res.status(400).json({ message: 'Exceeds available stock' });
    cart.items[idx].qty = newQty;
  } else {
    if (qty > product.stock)
      return res.status(400).json({ message: 'Exceeds available stock' });
    cart.items.push({ product: product._id, qty });
  }

  cart.updatedAt = new Date();
  await cart.save();
  await cart.populate('items.product', 'title slug price stock');

  const totals = computeTotals(cart);
  res
    .status(201)
    .json({ cart: { items: totals.items }, subtotal: totals.subtotal });
}

/** PATCH /api/cart/items/:productSlug (auth)  body: { qty } */
const updateSchema = z.object({
  qty: z.number().int().min(1).max(999),
});

async function updateItem(req, res) {
  const { qty } = updateSchema.parse(req.body);
  const { productSlug } = req.params;

  const product = await Product.findOne({ slug: productSlug, isActive: true });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  if (qty > product.stock)
    return res.status(400).json({ message: 'Exceeds available stock' });

  const cart = await getOrCreateCart(req.user.id);
  const idx = cart.items.findIndex(
    (i) => String(i.product._id) === String(product._id),
  );
  if (idx < 0) return res.status(404).json({ message: 'Item not in cart' });

  cart.items[idx].qty = qty;
  cart.updatedAt = new Date();
  await cart.save();
  await cart.populate('items.product', 'title slug price stock');

  const totals = computeTotals(cart);
  res.json({ cart: { items: totals.items }, subtotal: totals.subtotal });
}

/** DELETE /api/cart/items/:productSlug (auth) */
async function removeItem(req, res) {
  const { productSlug } = req.params;

  const product = await Product.findOne({ slug: productSlug });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const cart = await getOrCreateCart(req.user.id);
  const before = cart.items.length;
  cart.items = cart.items.filter(
    (i) => String(i.product._id) !== String(product._id),
  );
  if (cart.items.length === before)
    return res.status(404).json({ message: 'Item not in cart' });

  cart.updatedAt = new Date();
  await cart.save();
  await cart.populate('items.product', 'title slug price stock');

  const totals = computeTotals(cart);
  res.json({ cart: { items: totals.items }, subtotal: totals.subtotal });
}

/** DELETE /api/cart (auth) — clear cart */
async function clearCart(req, res) {
  const cart = await getOrCreateCart(req.user.id);
  cart.items = [];
  cart.updatedAt = new Date();
  await cart.save();
  res.json({ ok: true });
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};
