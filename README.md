# Camper Monitor

Cloudflare Worker monitors Roadsurfer, Movacar, Indie Campers and Imoova relocation offers, stores routes, filters, offers and run history in Cloudflare D1, and serves a Telegram bot and Mini App. Scheduled scans use Cloudflare Cron Triggers. No LLM is used at runtime.

## Layout

- `worker/` — Worker code, D1 schema and migrations, Wrangler configuration, import scripts
- `docs/index.html` — Mini App source bundled as a Worker static asset
- `gas/` — legacy Google Apps Script kept for migration and rollback
- `docs/cloudflare-deploy.md` — deployment and historical import instructions

The current production Worker is [camper-monitor.luksiko90.workers.dev](https://camper-monitor.luksiko90.workers.dev). Telegram Bot API credentials are Worker secrets. The rollout flag `ALERTS_ENABLED` in `worker/wrangler.jsonc` controls notification dispatch while scanner output is verified.

For a local deployment, run `npm ci` and `npm run deploy` in `worker/`. A GitHub Actions workflow can deploy changes pushed to `flatback` after `CLOUDFLARE_API_TOKEN` is configured as a repository secret.
