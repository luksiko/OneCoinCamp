import { describe, it, expect } from 'vitest';
import {
  routeMatchesOffer,
  offerMatchesUserFilters,
  isSilentHoursActive,
  parseCountryList,
  formatIsoDate,
  addDays,
} from '../src/services/filters';
import { NormalizedOffer, UserRoute, UserFilters, GlobalSettings } from '../src/types';

describe('Filter and Route Matching', () => {
  const sampleOffer: NormalizedOffer = {
    source: 'roadsurfer',
    offer_id: '12345',
    vehicle: 'Surfer Suite',
    vehicle_type: 'camper',
    origin: 'Berlin',
    origin_country: 'DE',
    destination: 'Rome',
    destination_country: 'IT',
    pickup_date: '2026-10-01',
    return_date: '2026-10-07',
    price: 1,
    currency: 'EUR',
    booking_url: 'https://example.com/book',
  };

  it('matches wildcards for origin and destination', () => {
    const route: UserRoute = {
      id: 'r1',
      telegram_id: '100',
      enabled: true,
      source: 'roadsurfer',
      origin_name: 'Все города',
      origin_id: '*',
      origin_country: 'DE',
      destination_name: 'Все города',
      destination_id: '*',
      destination_country: 'IT',
    };
    expect(routeMatchesOffer(route, sampleOffer)).toBe(true);
  });

  it('rejects if source differs', () => {
    const route: UserRoute = {
      id: 'r2',
      telegram_id: '100',
      enabled: true,
      source: 'movacar',
    };
    expect(routeMatchesOffer(route, sampleOffer)).toBe(false);
  });

  it('rejects if route is disabled', () => {
    const route: UserRoute = {
      id: 'r3',
      telegram_id: '100',
      enabled: false,
      source: 'roadsurfer',
    };
    expect(routeMatchesOffer(route, sampleOffer)).toBe(false);
  });

  it('matches user price filter', () => {
    const filters: UserFilters = {
      telegram_id: '100',
      allowed_origin_countries: 'DE,AT',
      allowed_destination_countries: 'IT,ES',
      max_price: 50,
      only_campers: true,
      window_days: 30,
    };
    expect(offerMatchesUserFilters(sampleOffer, filters)).toBe(true);

    const expensiveOffer = { ...sampleOffer, price: 100 };
    expect(offerMatchesUserFilters(expensiveOffer, filters)).toBe(false);
  });

  it('checks silent hours correctly', () => {
    const filters: UserFilters = {
      telegram_id: '100',
      allowed_origin_countries: 'DE',
      allowed_destination_countries: 'IT',
      silent_hours_enabled: true,
      silent_hours_start: '23:00',
      silent_hours_end: '07:00',
    };
    const settings: GlobalSettings = {
      poll_interval_minutes: 5,
      availability_check_interval_minutes: 60,
      window_days: 14,
      timezone: 'UTC',
      telegram_enabled: true,
      provider_roadsurfer_enabled: true,
      provider_movacar_enabled: true,
      provider_indiecampers_enabled: true,
      provider_imoova_enabled: true,
    };

    // 02:00 UTC is inside 23:00-07:00
    const night = new Date('2026-10-01T02:00:00Z');
    expect(isSilentHoursActive(filters, settings, night)).toBe(true);

    // 12:00 UTC is outside
    const day = new Date('2026-10-01T12:00:00Z');
    expect(isSilentHoursActive(filters, settings, day)).toBe(false);
  });
});
