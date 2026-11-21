import './config.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import { AppError } from './utils/http.js';
import authRoutes from './routes/auth.js';
import lookupRoutes from './routes/lookups.js';
import entrepreneurRoutes from './routes/entrepreneurs.js';
import investorRoutes from './routes/investors.js';
import ideaRoutes from './routes/ideas.js';

const app = express();
app.set('trust proxy', 1); // needed for rate limiting behind Vercel
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/entrepreneurs', entrepreneurRoutes);
app.use('/api/investors', investorRoutes);
app.use('/api/ideas', ideaRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

// One place that turns every error into a clear JSON message
const DB_ERRORS = {
  '23505': [409, 'That value already exists'],
  '23503': [400, 'One of the selected items does not exist'],
  '23502': [400, 'A required value is missing'],
  '23514': [400, 'A value breaks a database rule (check amounts and currency)'],
  '22P02': [400, 'An id or value has the wrong format'],
};
app.use((err, req, res, next) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err.code === 'P0001') return res.status(400).json({ error: err.message }); // our database trigger rules
  if (DB_ERRORS[err.code]) return res.status(DB_ERRORS[err.code][0]).json({ error: DB_ERRORS[err.code][1] });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again' });
});

export default app;
