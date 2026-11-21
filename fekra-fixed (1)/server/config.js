for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
}
export const JWT_SECRET = process.env.JWT_SECRET;
export const isProd = process.env.NODE_ENV === 'production';
