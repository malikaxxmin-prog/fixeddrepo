import jwt from 'jsonwebtoken';
import { JWT_SECRET, isProd } from '../config.js';
import { query } from '../db.js';
import { AppError, wrap } from '../utils/http.js';

export const COOKIE = 'token';

export function issueToken(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,   // JavaScript on the page cannot read it
    secure: isProd,   // HTTPS only when deployed
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export const requireAuth = wrap(async (req, res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new AppError(401, 'Please log in first');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'Your session has expired. Please log in again');
  }

  // Check the database on every request so suspensions apply immediately
  const { rows } = await query('SELECT id, role, is_suspended FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  if (!user) throw new AppError(401, 'Account not found. Please log in again');
  if (user.is_suspended) throw new AppError(403, 'This account is suspended');

  req.user = { id: user.id, role: user.role };
  next();
});

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : next(new AppError(403, `This action is only for ${roles.join(' or ')}s`));
