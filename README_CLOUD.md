
# Ghost System v1-C.5 (Cloud, Live-Capable)

This is the **Render-ready** build of Ghost System. It runs 24/7 and schedules:
- Weekly (Mon 05:00 PT): generate products → render PDFs → queue posts → price optimize
- Nightly (03:30 PT): sync sales (Gumroad/Lemon) → Notion rows → Meta audience seed

> **Live-capable:** If you set API keys in environment variables, it performs real actions.
> If keys are blank, it prints dry-run logs and skips network calls.

## Quick Deploy (Render)
1) Push this folder to a **new GitHub repo** (or upload directly in Render).
2) In Render, create a **Worker** → connect to this repo.
3) Build command: `npm install`  |  Start command: `npm start`
4) In the service **Environment** tab, add variables from `.env.example`.
5) Deploy. Logs will show `[runner] up on <port>` and cron messages.

## Manual commands
- `npm run forge`   – generate drafts & PDFs
- `npm run analyze` – slice snippets, post to Buffer/X, log to Notion
- `npm run sync`    – fetch sales, update Notion, seed Meta
(The cron runner also triggers these on schedule.)

## Safety
- Start with only one platform key at a time (e.g., Lemon first).
- Use burner social accounts for initial posting to tune rate limits.
