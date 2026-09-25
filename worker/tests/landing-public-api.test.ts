import { describe, expect, it, vi } from 'vitest';
import worker, { Env } from '../src/index';

describe('Landing Page, SEO, and Desktop Public Endpoints', () => {
  const createMockEnv = (overrides: Partial<Env> = {}): Env => {
    return {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [
              {
                source: 'roadsurfer',
                offer_id: 'rs_123',
                vehicle: 'VW California',
                origin: 'Munich',
                origin_country: 'DE',
                destination: 'Rome',
                destination_country: 'IT',
                pickup_date: '2026-10-12',
                return_date: '2026-10-17',
                price: 1,
                currency: 'EUR',
                booking_url: 'https://roadsurfer.com/rally',
                is_active: 1,
                found_at: '2026-09-25T12:00:00Z',
              },
            ],
          }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      } as any,
      ASSETS: {
        fetch: vi.fn().mockImplementation((req: Request) => {
          return new Response(`Asset content for ${new URL(req.url).pathname}`, { status: 200 });
        }),
      } as any,
      TELEGRAM_BOT_TOKEN_SECRET: 'test-bot-token',
      WORKER_PUBLIC_URL: 'https://camper-monitor.luksiko90.workers.dev',
      PADDLE_PRICE_ID: 'pri_test123',
      PADDLE_CLIENT_TOKEN: 'live_test123',
      ALERT_QUEUE: { send: vi.fn() } as any,
      ...overrides,
    };
  };

  const mockCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as any;

  it('serves robots.txt with search crawler directives and sitemap link', async () => {
    const env = createMockEnv();
    const req = new Request('https://camper-monitor.luksiko90.workers.dev/robots.txt');
    const res = await worker.fetch(req, env, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Allow: /');
    expect(text).toContain('Disallow: /api/');
    expect(text).toContain('Sitemap: https://camper-monitor.luksiko90.workers.dev/sitemap.xml');
  });

  it('serves sitemap.xml with canonical alternates for en, de, ru and /app', async () => {
    const env = createMockEnv();
    const req = new Request('https://camper-monitor.luksiko90.workers.dev/sitemap.xml');
    const res = await worker.fetch(req, env, mockCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    const text = await res.text();
    expect(text).toContain('<loc>https://camper-monitor.luksiko90.workers.dev/</loc>');
    expect(text).toContain('hreflang="en"');
    expect(text).toContain('hreflang="de"');
    expect(text).toContain('hreflang="ru"');
    expect(text).toContain('<loc>https://camper-monitor.luksiko90.workers.dev/app</loc>');
  });

  it('returns sanitized public offers from /api/public/offers without authentication', async () => {
    const env = createMockEnv();
    const req = new Request('https://camper-monitor.luksiko90.workers.dev/api/public/offers');
    const res = await worker.fetch(req, env, mockCtx);

    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(data.ok).toBe(true);
    expect(data.count).toBe(1);
    expect(data.offers[0]).toMatchObject({
      source: 'roadsurfer',
      vehicle: 'VW California',
      origin: 'Munich',
      destination: 'Rome',
      price: 1,
    });
    // Ensure raw internal fields are not leaked
    expect(data.offers[0].raw_json).toBeUndefined();
    expect(data.offers[0].offer_id).toBeUndefined();
  });

  it('returns bot info and paddle tokens from /api/public/bot-info', async () => {
    const env = createMockEnv();
    const req = new Request('https://camper-monitor.luksiko90.workers.dev/api/public/bot-info');
    const res = await worker.fetch(req, env, mockCtx);

    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(data.ok).toBe(true);
    expect(data.paddlePriceId).toBe('pri_test123');
    expect(data.paddleClientToken).toBe('live_test123');
  });

  it('rewrites /app to serve app.html asset', async () => {
    const env = createMockEnv();
    const req = new Request('https://camper-monitor.luksiko90.workers.dev/app');
    const res = await worker.fetch(req, env, mockCtx);

    expect(res.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalled();
    const fetchCallArg = (env.ASSETS.fetch as any).mock.calls[0][0];
    expect(new URL(fetchCallArg.url).pathname).toBe('/app.html');
  });
});
