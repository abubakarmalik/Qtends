const mongoose = require('mongoose');

/**
 * Category supports both top-level and subcategories.
 * - Top-level: parent = null
 * - Subcategory: parent = ObjectId of parent category
 */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },

    // NEW: parent ref (null for top-level)
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Helpful for queries: list children under a parent quickly
categorySchema.index({ parent: 1 });

module.exports = mongoose.model('Category', categorySchema);
