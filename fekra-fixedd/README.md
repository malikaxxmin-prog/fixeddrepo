# Fekra

A website that connects entrepreneurs in Egypt with investors.

## Folders (all at the top level of the repo)

| Path | What it is |
|---|---|
| `public/index.html` | The website (clickable prototype, simulated data). Vercel serves this. |
| `api/index.js` | Vercel serverless entry for the Express API |
| `server/` | Express back end: routes, middleware, validation |
| `database/` | `01_schema.sql`, then `02_update.sql` (run in the Supabase SQL editor) |
| `src/` | React page code for the later real front end (not used by the site yet) |

## Run locally

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL and JWT_SECRET
npm start                 # website + API on http://localhost:3001
```

The website works without a database (it uses simulated data). The API needs `.env`.
Check the API with `curl http://localhost:3001/api/health`.

## Deploy on Vercel

1. Import this repo. Leave **Root Directory** empty (the files must be at the top level of the repo).
2. Leave the framework preset on **Other**; `vercel.json` already sets no build and `public` as output.
3. Add environment variables `DATABASE_URL` (Supabase Transaction pooler string) and `JWT_SECRET`.

## Security

- Passwords are stored only as bcrypt hashes and never returned.
- Never commit `.env`. If a secret is ever pushed, change it.
