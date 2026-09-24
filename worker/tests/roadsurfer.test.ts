import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRoadsurferTimeframes } from '../src/providers/roadsurfer';

describe('Roadsurfer Provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
