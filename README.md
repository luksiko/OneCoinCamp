# Camper Monitor

Cloudflare Worker monitors Roadsurfer, Movacar, Indie Campers and Imoova relocation offers, stores routes, filters, offers and run history in Cloudflare D1, and serves a Telegram bot and Mini App. Scheduled scans use Cloudflare Cron Triggers. No LLM is used at runtime.

## Layout

- `worker/` — Worker code, D1 schema and migrations, Wrangler configuration, import scripts
- `docs/index.html` — Mini App source bundled as a Worker static asset
- `gas/` — legacy Google Apps Script kept for migration and rollback
- `docs/cloudflare-deploy.md` — deployment and historical import instructions

The current production Worker is [camper-monitor.luksiko90.workers.dev](https://camper-monitor.luksiko90.workers.dev). Telegram Bot API credentials are Worker secrets. The rollout flag `ALERTS_ENABLED` in `worker/wrangler.jsonc` controls notification dispatch while scanner output is verified.

For a local deployment, run `npm ci` and `npm run deploy` in `worker/`. A GitHub Actions workflow can deploy changes pushed to `flatback` after `CLOUDFLARE_API_TOKEN` is configured as a repository secret.

## Browser sign-in

The browser UI creates a short-lived login link to the Telegram bot. The user presses Start in a private chat, compares the six-digit code with the website, and confirms in the bot. The open browser tab then receives a seven-day session. The link expires after ten minutes and is consumed on first use. The bot username comes from `getMe`; the bot token remains a Worker secret. This flow requires an active Telegram webhook and the site's HTTPS address. Telegram Mini App sign-in continues to use `initData`.
