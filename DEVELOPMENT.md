# Development Log

## 2026-05-23 — Supabase setup

Wired the repo for a hosted Supabase project (no local Docker stack, no migrations or edge functions yet).

### Installed
- `supabase` CLI as devDependency (run via `npx supabase` or `npm run sb`)
- `@supabase/supabase-js` browser client

### Files added
- `supabase/config.toml` — from `supabase init`
- `src/lib/supabase.js` — browser client reading `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- `.env.example` — template for frontend env vars
- `.gitignore` — ignores `node_modules`, `dist`, `.env*`, supabase temp dirs

### npm scripts
| Script | Purpose |
| --- | --- |
| `npm run sb` | Generic supabase CLI passthrough |
| `npm run db:push` | Push local migrations to linked project |
| `npm run db:pull` | Pull remote schema into local migrations |
| `npm run db:diff` | Generate a migration from local schema diff |
| `npm run fn:deploy` | Deploy edge functions |

### Next steps (manual)
1. `npx supabase login`
2. `npx supabase link --project-ref <ref>` (ref from `https://<ref>.supabase.co`)
3. Copy `.env.example` → `.env`, fill in URL + anon key from dashboard Settings → API
4. `npm run db:pull` to sync existing schema

### Not yet done
- No migrations created
- No edge functions scaffolded
- Project not yet linked
