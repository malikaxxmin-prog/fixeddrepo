import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from '../utils/http.js';

const router = Router();

router.get('/industries', wrap(async (req, res) => {
  const { rows } = await query('SELECT id::int AS id, name, description FROM industries ORDER BY name');
  res.json({ industries: rows });
}));

router.get('/idea-types', wrap(async (req, res) => {
  const { rows } = await query('SELECT id::int AS id, name, description FROM idea_types ORDER BY name');
  res.json({ idea_types: rows });
}));

export default router;
