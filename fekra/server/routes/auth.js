import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { issueToken, requireAuth, COOKIE } from '../middleware/auth.js';
import { AppError, wrap, parse } from '../utils/http.js';

const router = Router();

// Compared against when the email is unknown, so timing does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes' },
});

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(255);

const registerSchema = z.object({
  email,
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be 72 characters or fewer'), // bcrypt limit
  full_name: z.string().trim().min(2, 'Enter your full name').max(150),
  phone: z.string().trim().max(30).optional(),
  city: z.string().trim().min(1).max(100).default('Cairo'),
  role: z.enum(['entrepreneur', 'investor'], { message: 'Role must be entrepreneur or investor' }),
});

const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password') });

// POST /api/auth/register
router.post('/register', limiter, wrap(async (req, res) => {
  const d = parse(registerSchema, req.body);
  const hash = await bcrypt.hash(d.password, 12);

  let user;
  try {
    user = await tx(async (c) => {
      const u = (await c.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
        [d.email, hash, d.role]
      )).rows[0];
      await c.query(
        'INSERT INTO user_profiles (id, full_name, phone, city, role) VALUES ($1, $2, $3, $4, $5)',
        [u.id, d.full_name, d.phone || null, d.city, d.role]
      );
      await c.query(
        d.role === 'entrepreneur'
          ? 'INSERT INTO entrepreneur_profiles (user_id) VALUES ($1)'
          : 'INSERT INTO investor_profiles (user_id) VALUES ($1)',
        [u.id]
      );
      return u;
    });
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'An account with this email already exists');
    throw err;
  }

  issueToken(res, user);
  res.status(201).json({ user: { ...user, full_name: d.full_name } });
}));

// POST /api/auth/login
router.post('/login', limiter, wrap(async (req, res) => {
  const d = parse(loginSchema, req.body);
  const { rows } = await query(
    `SELECT u.id, u.email, u.role, u.password_hash, u.is_suspended, p.full_name
     FROM users u LEFT JOIN user_profiles p ON p.id = u.id
     WHERE u.email = $1`,
    [d.email]
  );
  const u = rows[0];
  const ok = await bcrypt.compare(d.password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) throw new AppError(401, 'Email or password is incorrect');
  if (u.is_suspended) throw new AppError(403, 'This account is suspended');

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [u.id]);
  issueToken(res, u);

  const { password_hash, is_suspended, ...safeUser } = u; // never send the hash
  res.json({ user: safeUser });
}));

// GET /api/auth/me
router.get('/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.role, p.full_name, p.phone, p.city, p.avatar_url
     FROM users u LEFT JOIN user_profiles p ON p.id = u.id WHERE u.id = $1`,
    [req.user.id]
  );
  res.json({ user: rows[0] });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

export default router;
