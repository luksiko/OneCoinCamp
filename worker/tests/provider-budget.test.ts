import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, setGasProxyUrl } from '../src/utils/http';
import { ProviderBudgetExceeded, runWithProviderBudget } from '../src/utils/provider-budget';

describe('shared provider request budget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setGasProxyUrl(undefined);
  });

  it('serves 100 identical lookups through one HTTP request', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ offers: [1] })));
    vi.stubGlobal('fetch', fetchMock);
    await runWithProviderBudget(35, async (scope) => {
      const results = await Promise.all(Array.from({ length: 100 }, () =>
        fetchJson('https://api.movacar.de/offers', { retries: 0 })));
      expect(results).toHaveLength(100);
      expect(scope.used).toBe(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps 100 distinct requests at the configured budget', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await runWithProviderBudget(35, async (scope) => {
      const results = await Promise.allSettled(Array.from({ length: 100 }, (_, i) =>
        fetchJson(`https://api.movacar.de/offers?origin=${i}`, { retries: 0 })));
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(35);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(65);
      expect(scope.used).toBe(35);
    });
    expect(fetchMock).toHaveBeenCalledTimes(35);
  });

  it('counts retries and proxy fallback against the same budget', async () => {
    const fetchMock = vi.fn(async () => new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    setGasProxyUrl('https://example-proxy.test');
    await runWithProviderBudget(1, async (scope) => {
      await expect(fetchJson('https://example-provider.test/offers', { retries: 2 }))
        .rejects.toBeInstanceOf(ProviderBudgetExceeded);
      expect(scope.used).toBe(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
