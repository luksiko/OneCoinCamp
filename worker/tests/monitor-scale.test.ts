import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMonitorCycle } from '../src/services/monitor';
import { fetchOffersForRoute } from '../src/providers';
import type { DbClient } from '../src/db/client';
import type { TelegramService } from '../src/services/telegram';
import { fetchJson } from '../src/utils/http';

vi.mock('../src/providers', () => ({ fetchOffersForRoute: vi.fn() }));

describe('monitor planning at 100 users', () => {
  beforeEach(() => {
    vi.mocked(fetchOffersForRoute).mockReset().mockResolvedValue([]);
  });

  it('scans a shared route once for 100 subscribers', async () => {
    const users = Array.from({ length: 100 }, (_, index) => ({ telegram_id: String(index + 1), chat_id: String(index + 1) }));
    const db = {
      acquireMonitorLock: vi.fn().mockResolvedValue(true),
      releaseMonitorLock: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockResolvedValue({ telegram_enabled: true, window_days: 14 }),
      getLatestRun: vi.fn().mockResolvedValue(null),
      listActiveMonitorContexts: vi.fn().mockResolvedValue(users.map((user) => ({
        user, routes: [{ id: `route-${user.telegram_id}`, enabled: true, source: 'roadsurfer', origin_id: '6',
          origin_country: 'DE', destination_id: '16', destination_country: 'FR' }],
        filters: { allowed_origin_countries: '', allowed_destination_countries: '' },
      }))),
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting: vi.fn().mockResolvedValue(undefined),
      logRun: vi.fn().mockResolvedValue(undefined),
    };
    await runMonitorCycle(db as unknown as DbClient, {} as TelegramService);
    expect(fetchOffersForRoute).toHaveBeenCalledOnce();
    expect(db.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', request_count: 0 }));
  });

  it('stops at the HTTP budget and continues from the next route later', async () => {
    const users = Array.from({ length: 100 }, (_, index) => ({ telegram_id: String(index + 1), chat_id: String(index + 1) }));
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(fetchOffersForRoute).mockImplementation(async (route) => {
      await fetchJson(`https://api.movacar.de/offers?origin=${route.origin_id}`, { retries: 0 });
      return [];
    });
    const db = {
      acquireMonitorLock: vi.fn().mockResolvedValue(true),
      releaseMonitorLock: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockResolvedValue({ telegram_enabled: true, provider_request_budget: 35 }),
      getLatestRun: vi.fn().mockResolvedValue(null),
      listActiveMonitorContexts: vi.fn().mockResolvedValue(users.map((user) => ({
        user, routes: [{ id: `route-${user.telegram_id}`, enabled: true, source: 'movacar', origin_id: user.telegram_id, destination_id: '*' }],
        filters: { allowed_origin_countries: '', allowed_destination_countries: '' },
      }))),
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting: vi.fn().mockResolvedValue(undefined),
      logRun: vi.fn().mockResolvedValue(undefined),
    };
    try {
      await runMonitorCycle(db as unknown as DbClient, {} as TelegramService);
      expect(fetchMock).toHaveBeenCalledTimes(35);
      expect(db.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'partial', request_count: 35 }));
      expect(db.setSetting).toHaveBeenCalledWith('scan_route_cursor', 35);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses one Movacar origin lookup for different destinations', async () => {
    const users = Array.from({ length: 100 }, (_, index) => ({ telegram_id: String(index + 1), chat_id: String(index + 1) }));
    const db = {
      acquireMonitorLock: vi.fn().mockResolvedValue(true),
      releaseMonitorLock: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockResolvedValue({ telegram_enabled: true }),
      getLatestRun: vi.fn().mockResolvedValue(null),
      listActiveMonitorContexts: vi.fn().mockResolvedValue(users.map((user) => ({
        user, routes: [{ id: `route-${user.telegram_id}`, enabled: true, source: 'movacar', origin_id: 'berlin',
          destination_id: `destination-${user.telegram_id}`, destination_name: `Destination ${user.telegram_id}` }],
        filters: {},
      }))),
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting: vi.fn().mockResolvedValue(undefined),
      logRun: vi.fn().mockResolvedValue(undefined),
    };
    await runMonitorCycle(db as unknown as DbClient, {} as TelegramService);
    expect(fetchOffersForRoute).toHaveBeenCalledOnce();
    expect(vi.mocked(fetchOffersForRoute).mock.calls[0][0]).toEqual(expect.objectContaining({
      origin_id: 'berlin', destination_id: '*', destination_name: '',
    }));
  });
});
