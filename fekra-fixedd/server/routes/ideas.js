import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError, wrap, parse } from '../utils/http.js';
import { STAGES } from '../utils/schemas.js';

const router = Router();

const COLS = `b.id, b.title, b.business_name, b.description,
  b.industry_id::int AS industry_id, i.name AS industry,
  b.idea_type_id::int AS idea_type_id, t.name AS idea_type,
  b.funding_needed::float8 AS funding_needed, b.currency, b.target_market,
  b.idea_stage, b.status, b.created_at, b.updated_at`;
const FROM = `FROM business_ideas b
  JOIN industries i ON i.id = b.industry_id
  JOIN idea_types t ON t.id = b.idea_type_id`;
const MY_INTEREST = (p) => `(SELECT ii.status FROM idea_interests ii
  JOIN investor_profiles ip ON ip.id = ii.investor_id
  WHERE ii.idea_id = b.id AND ip.user_id = ${p}) AS my_interest`;

const idParam = z.object({ id: z.string().uuid('Invalid idea id') });

const ideaSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  business_name: z.string().trim().max(200).optional(),
  description: z.string().trim().min(20, 'Describe your idea in at least 20 characters').max(5000),
  industry_id: z.coerce.number().int().positive('Choose an industry'),
  idea_type_id: z.coerce.number().int().positive('Choose an idea type'),
  funding_needed: z.coerce.number().nonnegative('Funding cannot be negative').max(9999999999999),
  currency: z.literal('EGP', { message: 'Only EGP is supported' }).default('EGP'),
  target_market: z.string().trim().min(3, 'Describe your target market').max(2000),
  idea_stage: z.enum(STAGES, { message: 'Choose a valid stage' }).default('idea'),
  status: z.enum(['draft', 'published'], { message: 'Status must be draft or published' }).default('draft'),
});
const statusSchema = z.object({
  status: z.enum(['draft', 'published'], { message: 'Status must be draft or published' }),
});

// Makes sure the idea exists, belongs to this entrepreneur, and is not closed
async function ownedIdea(id, userId) {
  const { rows } = await query(
    `SELECT b.id, b.status FROM business_ideas b
     JOIN entrepreneur_profiles e ON e.id = b.entrepreneur_id
     WHERE b.id = $1 AND e.user_id = $2`,
    [id, userId]
  );
  if (!rows[0]) throw new AppError(404, 'Idea not found');
  if (rows[0].status === 'closed') throw new AppError(403, 'This idea is closed and can no longer be edited');
  return rows[0];
}

// ---- GET /api/ideas  (Explore page, investors only) ----
const exploreSchema = z.object({
  q: z.string().trim().max(100).optional(),
  industry_id: z.coerce.number().int().positive().optional(),
  idea_type_id: z.coerce.number().int().positive().optional(),
  max_funding: z.coerce.number().nonnegative().optional(),
  idea_stage: z.enum(STAGES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

router.get('/', requireAuth, requireRole('investor'), wrap(async (req, res) => {
  const f = parse(exploreSchema, req.query);
  const params = [req.user.id];
  const where = [`b.status = 'published'`];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', '$' + params.length));
  };
  if (f.q) add('(b.title ILIKE ? OR b.business_name ILIKE ? OR b.description ILIKE ?)', `%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
  if (f.industry_id) add('b.industry_id = ?', f.industry_id);
  if (f.idea_type_id) add('b.idea_type_id = ?', f.idea_type_id);
  if (f.max_funding !== undefined) add('b.funding_needed <= ?', f.max_funding);
  if (f.idea_stage) add('b.idea_stage = ?', f.idea_stage);
  params.push(f.limit, (f.page - 1) * f.limit);

  const { rows } = await query(
    `SELECT ${COLS}, ${MY_INTEREST('$1')}, COUNT(*) OVER()::int AS total
     ${FROM} WHERE ${where.join(' AND ')}
     ORDER BY b.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({
    ideas: rows.map(({ total, ...idea }) => idea),
    total: rows[0]?.total ?? 0,
    page: f.page,
    limit: f.limit,
  });
}));

// ---- GET /api/ideas/mine  (My ideas page, entrepreneurs only) ----
router.get('/mine', requireAuth, requireRole('entrepreneur'), wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT ${COLS},
       (SELECT COUNT(*)::int FROM idea_interests x WHERE x.idea_id = b.id AND x.status = 'active') AS interest_count
     ${FROM}
     JOIN entrepreneur_profiles e ON e.id = b.entrepreneur_id
     WHERE e.user_id = $1
     ORDER BY b.created_at DESC`,
    [req.user.id]
  );
  res.json({ ideas: rows });
}));

// ---- POST /api/ideas  (submit an idea) ----
router.post('/', requireAuth, requireRole('entrepreneur'), wrap(async (req, res) => {
  const d = parse(ideaSchema, req.body);
  const { rows } = await query(
    `INSERT INTO business_ideas
       (entrepreneur_id, title, business_name, description, industry_id, idea_type_id,
        funding_needed, currency, target_market, idea_stage, status)
     VALUES ((SELECT id FROM entrepreneur_profiles WHERE user_id = $1),
             $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, status, created_at`,
    [req.user.id, d.title, d.business_name ?? null, d.description, d.industry_id, d.idea_type_id,
     d.funding_needed, d.currency, d.target_market, d.idea_stage, d.status]
  );
  res.status(201).json({ idea: rows[0] });
}));

// ---- GET /api/ideas/:id  (idea details) ----
router.get('/:id', requireAuth, wrap(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { rows } = await query(
    `SELECT ${COLS}, p.full_name AS founder_name, e.user_id AS owner_user_id, ${MY_INTEREST('$2')}
     ${FROM}
     JOIN entrepreneur_profiles e ON e.id = b.entrepreneur_id
     JOIN user_profiles p ON p.id = e.user_id
     WHERE b.id = $1`,
    [id, req.user.id]
  );
  const idea = rows[0];
  const { role, id: userId } = req.user;
  const allowed = idea && (
    role === 'admin' ||
    (role === 'investor' && idea.status === 'published') ||
    (role === 'entrepreneur' && idea.owner_user_id === userId)
  );
  if (!allowed) throw new AppError(404, 'Idea not found'); // same message so drafts are not revealed
  delete idea.owner_user_id;
  res.json({ idea });
}));

// ---- PUT /api/ideas/:id  (edit your own idea) ----
router.put('/:id', requireAuth, requireRole('entrepreneur'), wrap(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const d = parse(ideaSchema, req.body);
  await ownedIdea(id, req.user.id);
  await query(
    `UPDATE business_ideas SET title = $2, business_name = $3, description = $4, industry_id = $5,
       idea_type_id = $6, funding_needed = $7, currency = $8, target_market = $9,
       idea_stage = $10, status = $11
     WHERE id = $1`,
    [id, d.title, d.business_name ?? null, d.description, d.industry_id, d.idea_type_id,
     d.funding_needed, d.currency, d.target_market, d.idea_stage, d.status]
  );
  res.json({ idea: { id, status: d.status } });
}));

// ---- PATCH /api/ideas/:id/status  (publish / unpublish) ----
router.patch('/:id/status', requireAuth, requireRole('entrepreneur'), wrap(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { status } = parse(statusSchema, req.body);
  await ownedIdea(id, req.user.id);
  await query('UPDATE business_ideas SET status = $2 WHERE id = $1', [id, status]);
  res.json({ idea: { id, status } });
}));

export default router;
