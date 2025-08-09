const { z } = require('zod');
const slugify = require('slugify');
const Category = require('../../models/category.model');

/** slug helpers (same style you used for products/categories) */
function toSlug(input) {
  return slugify(input, { lower: true, strict: true, trim: true });
}
async function uniqueSlug(baseText, excludeId = null) {
  const base = toSlug(baseText);
  let candidate = base,
    n = 2;
  // loop until unique
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const exists = await Category.findOne(q).lean();
    if (!exists) return candidate;
    candidate = `${base}-${n++}`;
  }
}

/** Schemas */
const createSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(), // optional: auto from name
  parentSlug: z.string().optional(), // optional: if present => create subcategory
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
  regenerateSlug: z.boolean().optional(),
  parentSlug: z.string().nullable().optional(), // set null/"" to move to top-level
});

/** POST /api/categories (admin) — create category OR subcategory */
async function createCategory(req, res) {
  const data = createSchema.parse(req.body);

  // If parentSlug provided -> find parent
  let parentId = null;
  if (data.parentSlug) {
    const parent = await Category.findOne({
      slug: data.parentSlug,
      isActive: true,
    });
    if (!parent)
      return res.status(400).json({ message: 'Parent category not found' });
    parentId = parent._id;
  }

  // auto/unique slug
  const baseForSlug = data.slug ? toSlug(data.slug) : data.name;
  const finalSlug = await uniqueSlug(baseForSlug);

  const cat = await Category.create({
    name: data.name,
    slug: finalSlug,
    parent: parentId,
  });

  return res.status(201).json({ item: cat });
}

/** GET /api/categories (public) — list active categories (flat) */
async function listCategories(_req, res) {
  const items = await Category.find({ isActive: true }).sort({
    parent: 1,
    name: 1,
  });
  return res.json({ items });
}

/** GET /api/categories/tree (public) — nested tree of categories */
async function tree(_req, res) {
  const all = await Category.find({ isActive: true }).lean();
  const byId = new Map(all.map((c) => [String(c._id), { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parent) {
      const p = byId.get(String(c.parent));
      if (p) p.children.push(c);
    } else roots.push(c);
  }
  return res.json({ items: roots });
}

/** GET /api/categories/:slug (public) — single active category */
async function getCategory(req, res) {
  const item = await Category.findOne({
    slug: req.params.slug,
    isActive: true,
  });
  if (!item) return res.status(404).json({ message: 'Not found' });
  return res.json({ item });
}

/** GET /api/categories/:slug/subcategories (public) — list children */
async function listSubcategories(req, res) {
  const parent = await Category.findOne({
    slug: req.params.slug,
    isActive: true,
  });
  if (!parent) return res.status(404).json({ message: 'Parent not found' });
  const items = await Category.find({
    parent: parent._id,
    isActive: true,
  }).sort({ name: 1 });
  return res.json({ items });
}

/** PATCH /api/categories/:slug (admin) — update, move under parent, or make top-level */
async function updateCategory(req, res) {
  const data = updateSchema.parse(req.body);
  const current = await Category.findOne({ slug: req.params.slug });
  if (!current) return res.status(404).json({ message: 'Not found' });

  // name
  if (data.name !== undefined) current.name = data.name;

  // move under parent / or make top-level
  if (data.parentSlug !== undefined) {
    if (data.parentSlug === null || data.parentSlug === '') {
      current.parent = null; // move to top-level
    } else {
      const parent = await Category.findOne({
        slug: data.parentSlug,
        isActive: true,
      });
      if (!parent)
        return res.status(400).json({ message: 'Parent category not found' });
      if (String(parent._id) === String(current._id)) {
        return res
          .status(400)
          .json({ message: 'Category cannot be its own parent' });
      }
      current.parent = parent._id;
    }
  }

  // slug policy
  if (data.slug) {
    current.slug = await uniqueSlug(data.slug, current._id);
  } else if (data.regenerateSlug && data.name) {
    current.slug = await uniqueSlug(data.name, current._id);
  }

  if (typeof data.isActive === 'boolean') current.isActive = data.isActive;

  await current.save();
  return res.json({ item: current });
}

/** DELETE /api/categories/:slug (admin) — soft delete */
async function deleteCategory(req, res) {
  const item = await Category.findOneAndUpdate(
    { slug: req.params.slug },
    { isActive: false },
    { new: true },
  );
  if (!item) return res.status(404).json({ message: 'Not found' });
  return res.json({ ok: true });
}

module.exports = {
  createCategory,
  listCategories,
  tree,
  getCategory,
  listSubcategories,
  updateCategory,
  deleteCategory,
};
