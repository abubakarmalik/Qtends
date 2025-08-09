const { z } = require('zod');
const slugify = require('slugify');
const Product = require('../../models/product.mode');
const Category = require('../../models/category.model'); // ⬅️ NEW: needed to resolve slugs

/**
 * Convert text to a clean slug.
 */
function toSlug(input) {
  return slugify(input, { lower: true, strict: true, trim: true });
}

/**
 * Ensure slug uniqueness in Product collection.
 * Will suffix with -2, -3 if needed.
 */
async function uniqueSlug(baseText, excludeId = null) {
  const base = toSlug(baseText);
  let candidate = base;
  let n = 2;

  // try base, then base-2, base-3, ...
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const exists = await Product.findOne(q).lean();
    if (!exists) return candidate;
    candidate = `${base}-${n++}`;
  }
}

/**
 * Helper: resolve category & subcategory by slug.
 * Validates that subcategory has a parent and belongs to the given category.
 * Returns ObjectId(s) or nulls.
 */
async function resolveCategoryRefs(categorySlug, subcategorySlug) {
  let category = null;
  let subcategory = null;

  if (categorySlug) {
    category = await Category.findOne({ slug: categorySlug, isActive: true });
    if (!category) throw new Error('categorySlug not found');
  }

  if (subcategorySlug) {
    subcategory = await Category.findOne({
      slug: subcategorySlug,
      isActive: true,
    });
    if (!subcategory) throw new Error('subcategorySlug not found');
    if (!subcategory.parent)
      throw new Error('subcategorySlug is not a subcategory');
  }

  // If both provided, ensure subcategory belongs to category
  if (
    subcategory &&
    category &&
    String(subcategory.parent) !== String(category._id)
  ) {
    throw new Error('subcategory does not belong to the given category');
  }

  return {
    categoryId: category ? category._id : null,
    subcategoryId: subcategory ? subcategory._id : null,
  };
}

/**
 * Validation schema for creating a product.
 * - slug is optional — will be generated from title if not provided.
 * - categorySlug / subcategorySlug are optional and validated if present.
 */
const createSchema = z.object({
  title: z.string().min(2),
  slug: z.string().min(2).optional(),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative().optional(),
  images: z.array(z.string().url()).optional(),
  categorySlug: z.string().optional(), // ⬅️ NEW
  subcategorySlug: z.string().optional(), // ⬅️ NEW
});

/**
 * GET /api/products (public)
 * Optional filters:
 *   - ?category=<categorySlug>
 *   - ?subcategory=<subcategorySlug>
 */
async function listProducts(req, res) {
  const { category: catSlug, subcategory: subSlug } = req.query;

  const filter = { isActive: true };

  // Filter by category slug if provided
  if (catSlug) {
    const c = await Category.findOne({ slug: String(catSlug), isActive: true });
    if (!c) return res.status(400).json({ message: 'category not found' });
    filter.category = c._id;
  }

  // Filter by subcategory slug if provided
  if (subSlug) {
    const s = await Category.findOne({ slug: String(subSlug), isActive: true });
    if (!s) return res.status(400).json({ message: 'subcategory not found' });
    filter.subcategory = s._id;
  }

  const items = await Product.find(filter)
    .populate('category', 'name slug') // bring back names/slugs for convenience
    .populate('subcategory', 'name slug') // bring back names/slugs for convenience
    .sort({ createdAt: -1 });

  res.json({ items });
}

/**
 * GET /api/products/:slug (public)
 */
async function getProduct(req, res) {
  const item = await Product.findOne({ slug: req.params.slug, isActive: true })
    .populate('category', 'name slug')
    .populate('subcategory', 'name slug');
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json({ item });
}

/**
 * POST /api/products (admin)
 * Auto-generates slug if not provided.
 * Also resolves & validates category/subcategory if given.
 */
async function createProduct(req, res) {
  const data = createSchema.parse(req.body);

  // Determine base for slug: explicit or from title
  const baseForSlug = data.slug ? toSlug(data.slug) : data.title;
  const finalSlug = await uniqueSlug(baseForSlug);

  // Resolve category refs (optional)
  let refs = { categoryId: null, subcategoryId: null };
  try {
    refs = await resolveCategoryRefs(data.categorySlug, data.subcategorySlug);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }

  const item = await Product.create({
    title: data.title,
    slug: finalSlug,
    description: data.description,
    price: data.price,
    stock: data.stock ?? 0,
    images: data.images ?? [],
    category: refs.categoryId, // ⬅️ NEW
    subcategory: refs.subcategoryId, // ⬅️ NEW
  });

  res.status(201).json({ item });
}

/**
 * PATCH /api/products/:slug (admin)
 * Keep slug stable unless:
 *   - client sends a new slug, or
 *   - client sets regenerateSlug=true with a new title.
 */
const updateSchema = z.object({
  title: z.string().min(2).optional(),
  slug: z.string().min(2).optional(),
  regenerateSlug: z.boolean().optional(),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative().optional(),
  images: z.array(z.string().url()).optional(),
  isActive: z.boolean().optional(),
  categorySlug: z.string().optional(), // ⬅️ NEW
  subcategorySlug: z.string().optional(), // ⬅️ NEW
});

async function updateProduct(req, res) {
  const data = updateSchema.parse(req.body);
  const current = await Product.findOne({ slug: req.params.slug });
  if (!current) return res.status(404).json({ message: 'Not found' });

  // Apply title if provided
  if (data.title !== undefined) current.title = data.title;

  // Slug logic
  if (data.slug) {
    // Explicit slug override
    current.slug = await uniqueSlug(data.slug, current._id);
  } else if (data.regenerateSlug && data.title) {
    // Regenerate from updated title
    current.slug = await uniqueSlug(data.title, current._id);
  }
  // Else: keep slug as-is

  // Category/Subcategory updates (if either key present)
  if (data.categorySlug !== undefined || data.subcategorySlug !== undefined) {
    try {
      const { categoryId, subcategoryId } = await resolveCategoryRefs(
        data.categorySlug,
        data.subcategorySlug,
      );
      current.category = categoryId;
      current.subcategory = subcategoryId;
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  // Other fields
  if (data.description !== undefined) current.description = data.description;
  if (data.price !== undefined) current.price = data.price;
  if (data.stock !== undefined) current.stock = data.stock;
  if (data.images !== undefined) current.images = data.images;
  if (typeof data.isActive === 'boolean') current.isActive = data.isActive;

  await current.save();

  // Return with populated refs for convenience
  const item = await Product.findById(current._id)
    .populate('category', 'name slug')
    .populate('subcategory', 'name slug');

  res.json({ item });
}

/**
 * DELETE /api/products/:slug (admin)
 * Soft delete (isActive=false)
 */
async function deleteProduct(req, res) {
  const item = await Product.findOneAndUpdate(
    { slug: req.params.slug },
    { isActive: false },
    { new: true },
  );
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json({ ok: true });
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};
