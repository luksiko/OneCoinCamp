import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRoadsurferTimeframes, fetchRoadsurferDestinations } from '../src/providers/roadsurfer';

describe('Roadsurfer Provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly requests rally.fetchRoutes and resolves destinations from returns array', async () => {
    // 1st fetch: fetchRoadsurferDestinations calls /rally/stations/6
    // 2nd fetch: getRoadsurferAllStations calls /rally/stations
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 6,
            name: 'Berlin',
            one_way: true,
            returns: [16],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: 6, name: 'Berlin', city: { country: 'DE' }, one_way: true, enabled: true },
            { id: 16, name: 'Aix-Marseille', city: { country: 'FR' }, one_way: true, enabled: true },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const dests = await fetchRoadsurferDestinations('6', ['FR']);
    expect(dests).toEqual([
      {
        id: '16',
        name: 'Aix-Marseille',
        country: 'FR',
      },
    ]);
  });

  it('correctly parses camelCase startDate and endDate from timeframes API', async () => {
    const mockPayload = [
      {
        startDate: '2026-10-26T00:00:00+00:00',
        endDate: '2026-11-02T00:00:00+00:00',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const tf = await fetchRoadsurferTimeframes('6', '16');
    expect(tf).toEqual([
      {
        start: '2026-10-26',
        end: '2026-11-02',
      },
    ]);
  });

  it('correctly parses snake_case start_date and end_date from timeframes API', async () => {
    const mockPayload = [
      {
        start_date: '2026-10-15',
        end_date: '2026-10-20',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const tf = await fetchRoadsurferTimeframes('108', '37');
    expect(tf).toEqual([
      {
        start: '2026-10-15',
        end: '2026-10-20',
      },
    ]);
  });
});
