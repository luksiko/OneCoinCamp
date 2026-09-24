# Cloudflare deployment

The Cloudflare Worker `camper-monitor` serves both the Telegram Mini App and its API. The HTML source is `docs/index.html`; `npm run build:assets` copies it into the Worker asset directory. The static copy is generated and ignored by Git.

## Local deployment

From `worker/`:

```sh
npm ci
npm run deploy
```

Wrangler must be authenticated to the Cloudflare account that owns `camper-monitor`. `wrangler.jsonc` contains the D1 binding and the 10 minute Cron schedule. The Telegram bot token and webhook secret are encrypted Worker secrets named `TELEGRAM_BOT_TOKEN_SECRET` and `TELEGRAM_WEBHOOK_SECRET`; do not add their values to Git or Wrangler vars.

## GitHub deployment

`.github/workflows/deploy-cloudflare.yml` deploys changes to `worker/**` and `docs/index.html` when pushed to `flatback`, or on a manual workflow dispatch. Add a repository secret named `CLOUDFLARE_API_TOKEN` with permission to edit Workers scripts, Workers routes, and D1 resources in the Cloudflare account. Without this secret, the deployment job skips. The account ID is already in the workflow.

For a one time database migration, first export a D1 backup, then apply each new SQL file from `worker/migrations/` with `npx wrangler d1 execute camper_monitor_db --remote --file=migrations/<file> --yes`. Migrations are not included in the automatic deploy workflow because they may need coordinated data backfills.

## Historical data

The Firestore export is imported with `node scripts/migrate_firestore.js --export /path/to/export.json --apply`. The GAS Sheets XLSX is imported with `python3 scripts/migrate_sheets.py /path/to/export.xlsx --apply` and requires `openpyxl`. Both source exports contain private data and must stay outside Git.

After deploying, inspect the latest `runs` row in D1 and the Telegram webhook status before setting `ALERTS_ENABLED` to `true` in `wrangler.jsonc` and redeploying. Disable the three legacy GAS time triggers during the final cutover to prevent duplicate scans or notifications.
