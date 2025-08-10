const mongoose = require('mongoose');

/**
 * We snapshot product title/slug/price at purchase time so
 * later price changes don't affect old orders.
 */
const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    title: { type: String, required: true },
    slug: { type: String, required: true },
    price: { type: Number, required: true }, // unit price at time of order
    qty: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true }, // price * qty at order time
  },
  { _id: false },
);

/**
 * Payment + status are simple to start:
 * - status: pending -> paid -> shipped -> delivered
 * - cancelled: separate boolean & timestamp
 * You can expand with more states later.
 */
const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // snapshot of items
    items: { type: [orderItemSchema], required: true },

    // totals
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, required: true, default: 0 },
    tax: { type: Number, required: true, default: 0 },
    grandTotal: { type: Number, required: true },

    // simple shipping address (extend later)
    shippingAddress: {
      fullName: String,
      phone: String,
      address1: String,
      address2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },

    // payment
    paymentMethod: { type: String, default: 'cod' }, // cod = cash on delivery (placeholder)
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid',
    },

    // order status lifecycle
    status: {
      type: String,
      enum: ['pending', 'paid', 'shipped', 'delivered'],
      default: 'pending',
      index: true,
    },

    cancelled: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Order', orderSchema);
