# Camper Monitor

Cloudflare Worker monitors Roadsurfer, Movacar, Indie Campers and Imoova relocation offers, stores routes, filters, offers and run history in Cloudflare D1, and serves a Telegram bot and Mini App. Scheduled scans use Cloudflare Cron Triggers. No LLM is used at runtime.

The scanner shares provider responses across users, caps actual provider HTTP attempts at 35 per cycle by default (up to 40 through `provider_request_budget`), and rotates through remaining routes on later cycles. Repeated manual scans are held for 8 minutes by default (`minimum_scan_gap_minutes`). Telegram alerts are saved in a D1 outbox and dispatched by the `camper-monitor-alerts` Cloudflare Queue consumer; queue delivery and provider scanning use separate Worker invocations. Offer rows record `last_seen_at` when reconfirmed. Provider failures do not mark offers inactive.

## Layout

- `worker/` — Worker code, D1 schema and migrations, Wrangler configuration, import scripts
- `docs/index.html` — Mini App source bundled as a Worker static asset
- `gas/` — legacy Google Apps Script kept for migration and rollback
- `docs/cloudflare-deploy.md` — deployment and historical import instructions

The current production Worker is [camper-monitor.luksiko90.workers.dev](https://camper-monitor.luksiko90.workers.dev). Telegram Bot API credentials are Worker secrets. The rollout flag `ALERTS_ENABLED` in `worker/wrangler.jsonc` controls notification dispatch while scanner output is verified.

For a local deployment, run `npm ci` and `npm run deploy` in `worker/`. A GitHub Actions workflow can deploy changes pushed to `flatback` after `CLOUDFLARE_API_TOKEN` is configured as a repository secret.

Before deploying this version to an existing database, create the `camper-monitor-alerts` Queue and apply `worker/migrations/0006_alert_outbox.sql` and `worker/migrations/0007_offer_last_seen.sql` remotely. `worker/migrations/0008_disable_unreachable_users.sql` cleans up accounts whose Telegram chats are known to be unavailable. Fresh installations use `worker/schema.sql`.

## Browser sign-in

The browser UI creates a short-lived login link to the Telegram bot. The user presses Start in a private chat, compares the six-digit code with the website, and confirms in the bot. The open browser tab then receives a seven-day session. The link expires after ten minutes and is consumed on first use. The bot username comes from `getMe`; the bot token remains a Worker secret. This flow requires an active Telegram webhook and the site's HTTPS address. Telegram Mini App sign-in continues to use `initData`.
