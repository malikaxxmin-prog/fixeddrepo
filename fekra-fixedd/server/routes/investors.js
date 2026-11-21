import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError, wrap, parse } from '../utils/http.js';
import { STAGES, profileFields } from '../utils/schemas.js';
import { updateBaseProfile } from '../utils/profile.js';

const router = Router();
router.use(requireAuth, requireRole('investor'));

const ids = z.array(z.number().int().positive()).max(50).optional();

const updateSchema = z.object({
  ...profileFields,
  investor_bio: z.string().trim().max(2000).optional(),
  min_funding: z.coerce.number().nonnegative('Min funding cannot be negative').optional(),
  max_funding: z.coerce.number().nonnegative('Max funding cannot be negative').optional(),
  preferred_idea_stage: z.enum(STAGES, { message: 'Choose a valid stage' }).optional(),
  industry_ids: ids,   // replaces the investor's preferred industries
  idea_type_ids: ids,  // replaces the investor's preferred idea types
}).refine(
  (d) => d.min_funding === undefined || d.max_funding === undefined || d.min_funding <= d.max_funding,
  { message: 'Min funding must not exceed max funding', path: ['min_funding'] }
);

async function getProfile(userId) {
  const { rows } = await query(
    `SELECT u.email, p.full_name, p.phone, p.city, p.avatar_url,
            i.id AS investor_id, i.investor_bio,
            i.min_funding::float8 AS min_funding, i.max_funding::float8 AS max_funding,
            i.preferred_idea_stage, i.currency,
            COALESCE((SELECT array_agg(industry_id::int ORDER BY industry_id)
                      FROM investor_industry_preferences WHERE investor_id = i.id), '{}') AS industry_ids,
            COALESCE((SELECT array_agg(idea_type_id::int ORDER BY idea_type_id)
                      FROM investor_idea_type_preferences WHERE investor_id = i.id), '{}') AS idea_type_ids
     FROM investor_profiles i
     JOIN user_profiles p ON p.id = i.user_id
     JOIN users u ON u.id = i.user_id
     WHERE i.user_id = $1`,
    [userId]
  );
  if (!rows[0]) throw new AppError(404, 'Investor profile not found');
  return rows[0];
}

// GET /api/investors/me
router.get('/me', wrap(async (req, res) => {
  res.json({ profile: await getProfile(req.user.id) });
}));

// PUT /api/investors/me
router.put('/me', wrap(async (req, res) => {
  const d = parse(updateSchema, req.body);
  await tx(async (c) => {
    await updateBaseProfile(c, req.user.id, d);
    const r = await c.query(
      `UPDATE investor_profiles SET
         investor_bio = COALESCE($2, investor_bio),
         min_funding = COALESCE($3, min_funding),
         max_funding = COALESCE($4, max_funding),
         preferred_idea_stage = COALESCE($5, preferred_idea_stage)
       WHERE user_id = $1 RETURNING id`,
      [req.user.id, d.investor_bio, d.min_funding, d.max_funding, d.preferred_idea_stage]
    );
    const investorId = r.rows[0].id;

    if (d.industry_ids) {
      await c.query('DELETE FROM investor_industry_preferences WHERE investor_id = $1', [investorId]);
      await c.query(
        `INSERT INTO investor_industry_preferences (investor_id, industry_id)
         SELECT DISTINCT $1::uuid, x FROM unnest($2::bigint[]) AS x`,
        [investorId, d.industry_ids]
      );
    }
    if (d.idea_type_ids) {
      await c.query('DELETE FROM investor_idea_type_preferences WHERE investor_id = $1', [investorId]);
      await c.query(
        `INSERT INTO investor_idea_type_preferences (investor_id, idea_type_id)
         SELECT DISTINCT $1::uuid, x FROM unnest($2::bigint[]) AS x`,
        [investorId, d.idea_type_ids]
      );
    }
  });
  res.json({ profile: await getProfile(req.user.id) });
}));

export default router;
