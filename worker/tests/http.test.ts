import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchJson, setGasProxyUrl, getGasProxyUrl } from '../src/utils/http';

describe('HTTP Client & GAS Proxy Fallback', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setGasProxyUrl(undefined);
    vi.restoreAllMocks();
  });

  it('sets and gets the global GAS proxy URL', () => {
    setGasProxyUrl('https://script.google.com/test');
    expect(getGasProxyUrl()).toBe('https://script.google.com/test');
  });

  it('makes direct fetch when domain is not blocked and succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ ok: true, data: [1, 2, 3] }),
    } as any);

    const result = await fetchJson('https://api.movacar.de/offers');
    expect(result).toEqual({ ok: true, data: [1, 2, 3] });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.movacar.de/offers', expect.anything());
  });

  it('automatically routes known blocked hosts (roadsurfer) directly through GAS proxy', async () => {
    setGasProxyUrl('https://script.google.com/macros/s/test/exec');

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith('https://script.google.com/macros/s/test/exec?proxy=1')) {
        return {
          status: 200,
          text: async () => JSON.stringify({
            status: 200,
            body: JSON.stringify({ stations: [{ id: 6, name: 'Berlin' }] }),
          }),
        };
      }
      throw new Error(`Unexpected direct call to ${url}`);
    });

    const result = await fetchJson('https://booking.roadsurfer.com/api/en/rally/stations/6');
    expect(result).toEqual({ stations: [{ id: 6, name: 'Berlin' }] });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('https://script.google.com/macros/s/test/exec?proxy=1');
  });

  it('falls back to GAS proxy when direct fetch returns 403 Forbidden', async () => {
    setGasProxyUrl('https://script.google.com/macros/s/test/exec');

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      if (url.includes('example.com/blocked-api')) {
        return {
          status: 403,
          text: async () => '<html>403 Forbidden</html>',
        };
      }
      if (url.startsWith('https://script.google.com/macros/s/test/exec?proxy=1')) {
        const body = JSON.parse(opts.body);
        expect(body.url).toBe('https://example.com/blocked-api');
        return {
          status: 200,
          text: async () => JSON.stringify({
            status: 200,
            body: JSON.stringify({ unblocked: true }),
          }),
        };
      }
      throw new Error(`Unknown url ${url}`);
    });

    const result = await fetchJson('https://example.com/blocked-api');
    expect(result).toEqual({ unblocked: true });
    // First call was direct (got 403), second was fallback to GAS proxy
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('never proxies api.telegram.org even on error', async () => {
    setGasProxyUrl('https://script.google.com/macros/s/test/exec');

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      text: async () => JSON.stringify({ ok: false, description: 'Unauthorized' }),
    } as any);

    await expect(fetchJson('https://api.telegram.org/bot123/getMe', { retries: 0 })).rejects.toThrow('HTTP 401');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://api.telegram.org/bot123/getMe');
  });
});
