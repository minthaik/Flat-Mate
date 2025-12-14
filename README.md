# paxbud

Live demo: https://flatmate-nine.vercel.app/

## Scripts
- `npm install` — install deps
- `npm run dev` — local dev (Vite)
- `npm run build` — production build to `dist/`

## Deploy (Vercel)
Build command: `npm run build`
Output directory: `dist`
Framework preset: Vite
SPA rewrites are handled via `vercel.json`.

## API Contract
A stable API layer for web and Flutter clients is documented in [docs/api-contract.md](docs/api-contract.md). It covers JWT auth (access + refresh), durable `app_user_id` mapping, and resource endpoints for houses, chores, expenses, and notes.
