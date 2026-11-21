import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError, wrap, parse } from '../utils/http.js';
import { urlOrEmpty, profileFields } from '../utils/schemas.js';
import { updateBaseProfile } from '../utils/profile.js';

const router = Router();
router.use(requireAuth, requireRole('entrepreneur'));

const updateSchema = z.object({
  ...profileFields,
  website_url: urlOrEmpty,
  bio: z.string().trim().max(2000).optional(),
});

async function getProfile(userId) {
  const { rows } = await query(
    `SELECT u.email, p.full_name, p.phone, p.city, p.avatar_url,
            e.id AS entrepreneur_id, e.website_url, e.bio
     FROM entrepreneur_profiles e
     JOIN user_profiles p ON p.id = e.user_id
     JOIN users u ON u.id = e.user_id
     WHERE e.user_id = $1`,
    [userId]
  );
  if (!rows[0]) throw new AppError(404, 'Entrepreneur profile not found');
  return rows[0];
}

// GET /api/entrepreneurs/me
router.get('/me', wrap(async (req, res) => {
  res.json({ profile: await getProfile(req.user.id) });
}));

// PUT /api/entrepreneurs/me  (send only the fields you want to change)
router.put('/me', wrap(async (req, res) => {
  const d = parse(updateSchema, req.body);
  await tx(async (c) => {
    await updateBaseProfile(c, req.user.id, d);
    await c.query(
      `UPDATE entrepreneur_profiles
       SET website_url = COALESCE($2, website_url), bio = COALESCE($3, bio)
       WHERE user_id = $1`,
      [req.user.id, d.website_url, d.bio]
    );
  });
  res.json({ profile: await getProfile(req.user.id) });
}));

export default router;
