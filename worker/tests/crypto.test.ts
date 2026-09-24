import { describe, it, expect } from 'vitest';
import { computeOfferFingerprint, sha256 } from '../src/utils/crypto';

describe('Crypto & Fingerprint', () => {
  it('computes deterministic SHA-256 hash', async () => {
    const hash1 = await sha256('hello world');
    const hash2 = await sha256('hello world');
    expect(hash1).toBe(hash2);
    expect(hash1).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('computes unique fingerprint for distinct offers', async () => {
    const off1 = {
      source: 'roadsurfer',
      offer_id: '1',
      origin: 'Berlin',
      destination: 'Rome',
      pickup_date: '2026-10-01',
      return_date: '2026-10-07',
      price: 1,
    };
    const off2 = {
      ...off1,
      price: 2,
    };

    const fp1 = await computeOfferFingerprint(off1);
    const fp2 = await computeOfferFingerprint(off2);

    expect(fp1).not.toBe(fp2);
    expect(fp1.length).toBe(64);
    expect(await computeOfferFingerprint({ ...off1, vehicle_id: 'vehicle-1' })).toBe(fp1);
  });
});
