const { z } = require('zod');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const env = require('../../config/env');

const signToken = (id, role) =>
  jwt.sign({ id, role }, env.JWT_SECRET, { expiresIn: '7d' });

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

async function register(req, res) {
  const data = registerSchema.parse(req.body);
  const exists = await User.findOne({ email: data.email });
  if (exists) return res.status(409).json({ message: 'Email already in use' });
  const user = await User.create(data);
  const token = signToken(user.id, user.role);
  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

async function login(req, res) {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = signToken(user.id, user.role);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

module.exports = { register, login };
