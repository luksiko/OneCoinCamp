# Camper Micro-Proxy

Lightweight micro-proxy service for forwarding HTTP requests from Cloudflare Workers to upstream providers that block Cloudflare datacenter IP ranges (e.g., Roadsurfer).

Completely eliminates dependence on Google Apps Script and its 20,000 requests/day quota.

---

## Deploy Option 1: Vercel (Recommended - 1 Click & Free)

1. Open [vercel.com](https://vercel.com) $\rightarrow$ **Add New Project**.
2. Select your repository `luksiko/OneCoinCamp`.
3. In **Root Directory**, click *Edit* and select `flatback/proxy`.
4. Click **Deploy**.
5. Copy your deployment domain (e.g., `https://camper-proxy.vercel.app`).
6. Set this URL in your Cloudflare Worker:
   * Either in `flatback/worker/wrangler.jsonc` (set `GAS_PROXY_URL` or `EXTERNAL_PROXY_URL`).
   * Or in Cloudflare D1 `settings`:
     ```bash
     npx wrangler d1 execute camper_monitor_db --remote --command="INSERT OR REPLACE INTO settings (key, value) VALUES ('gas_proxy_url', 'https://your-proxy.vercel.app');"
     ```

---

## Deploy Option 2: Google Cloud Run (Free Tier)

Using `gcloud`:
```bash
cd flatback/proxy
gcloud run deploy camper-proxy \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated
```
Then copy the Service URL provided by Cloud Run.

---

## Deploy Option 3: Render (Free Tier)

1. Open [render.com](https://render.com) $\rightarrow$ **New Web Service**.
2. Connect `luksiko/OneCoinCamp`.
3. Set **Root Directory** to `flatback/proxy`.
4. Environment: **Node**. Build command: `npm install`. Start command: `node server.js`.
