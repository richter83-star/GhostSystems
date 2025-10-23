# Ghost System v1-C.5 (Cloud) — Autonomous Deploy

This package is the **cloud-ready** build of Ghost System.
It runs 24/7 on a low-cost host (Render/Railway) and schedules:
- Weekly: product generation → PDF → postings → price optimizer
- Nightly: sales sync → Notion update → Meta audience seed

## Options
- **Render**: uses `render.yaml` to define a background worker and two cron jobs.
- **Railway**: uses `railway.json` suggestion and a `start` command to keep a worker alive with in-process cron.

## Quickstart (Render)
1) Create a new **Private Service** from this folder's repo or upload.
2) Add environment variables in the Render dashboard (copy from `.env.example`).
3) Render will auto-detect Node + install.
4) Cron jobs from `render.yaml` will run on schedule. The worker keeps a tiny HTTP server alive.

## Quickstart (Railway)
1) Create a new project → Deploy from this folder.
2) Set environment variables in Variables tab.
3) Start the service; in-process cron will run weekly + nightly.

## Commands
- `npm run start` — runs the cloud cron runner (weekly + nightly schedules).
- `npm run forge` / `analyze` / `sync` still work for manual runs.
