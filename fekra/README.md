# Fekra

A website that connects entrepreneurs in Egypt with investors. Entrepreneurs submit ideas, investors browse and show interest, and both can connect and chat.

## Folders

| Path | What it is |
|---|---|
| `prototype/index.html` | Clickable front-end prototype (one file, simulated data, no real login). Open it in a browser. |
| `database/01_schema.sql` | Original PostgreSQL schema (11 tables). Run first. |
| `database/02_update.sql` | Update script: `users` table for own login, reports, rules. Run second. |
| `server/` | Express back end: routes, middleware, validation |
| `api/index.js` | Vercel entry point for the API |
| `src/` | React code that calls the API (`lib/api.js`, `pages/MyIdeas.jsx`) |

This repo has no React app shell yet (`index.html`, `src/main.jsx`, `src/App.jsx`). If you already have a Vite project, copy these folders into it and merge `package.json`.

## Set up the database (Supabase)

1. Open the Supabase SQL editor.
2. Run `database/01_schema.sql`, then `database/02_update.sql`.
3. The first script references Supabase's `auth.users`; the update script removes that link.
4. Insert your own rows into `industries` and `idea_types`, or the form dropdowns will be empty.

## Run the back end locally

```bash
npm install
cp .env.example .env     # then fill in DATABASE_URL and JWT_SECRET
npm run api              # API on http://localhost:3001
curl http://localhost:3001/api/health
```

Run the React app in a second terminal with `npm run dev` (Vite proxies `/api` to port 3001).

## Routes built so far

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/lookups/industries`, `GET /api/lookups/idea-types`
- `GET|PUT /api/entrepreneurs/me`
- `GET|PUT /api/investors/me`
- `GET /api/ideas` (investors, with filters), `GET /api/ideas/mine`, `POST /api/ideas`, `GET|PUT /api/ideas/:id`, `PATCH /api/ideas/:id/status`

Still to build: interests, connections and messages, admin.

## Deploy (Vercel)

1. Import the GitHub repo in Vercel.
2. Add environment variables `DATABASE_URL` and `JWT_SECRET` in the project settings.
3. Use the Supabase **Transaction pooler** connection string.

## Security notes

- Passwords are stored only as bcrypt hashes. The hash is never returned by any route.
- Login uses an httpOnly cookie holding a JWT. Role checks run on the server.
- Never commit `.env`. If a secret is ever pushed by mistake, change it.
