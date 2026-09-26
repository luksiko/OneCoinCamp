import { NormalizedOffer, UserRoute } from '../types';
import { fetchJson } from '../utils/http';
import { DbClient } from '../db/client';

export const IMOOVA_COUNTRIES: Record<string, string> = {
  'Berlin': 'DE', 'Munich': 'DE', 'Hamburg': 'DE', 'Frankfurt': 'DE',
  'Cologne': 'DE', 'Stuttgart': 'DE', 'Dusseldorf': 'DE', 'Dresden': 'DE',
  'Paris': 'FR', 'Lyon': 'FR', 'Marseille': 'FR', 'Bordeaux': 'FR',
  'Madrid': 'ES', 'Barcelona': 'ES', 'Seville': 'ES', 'Valencia': 'ES',
  'Rome': 'IT', 'Milan': 'IT', 'Naples': 'IT', 'Florence': 'IT', 'Venice': 'IT',
  'Lisbon': 'PT', 'Porto': 'PT', 'Faro': 'PT',
  'Amsterdam': 'NL', 'Rotterdam': 'NL', 'Brussels': 'BE',
  'Vienna': 'AT', 'Salzburg': 'AT', 'Zurich': 'CH', 'Geneva': 'CH',
  'London': 'GB', 'Edinburgh': 'GB',
  'Dublin': 'IE', 'Prague': 'CZ', 'Budapest': 'HU', 'Warsaw': 'PL',
  'Zagreb': 'HR', 'Split': 'HR', 'Dubrovnik': 'HR',
};

async function getExchangeRates(db?: DbClient): Promise<Record<string, number> | null> {
  const CACHE_KEY = 'exchange_rates_eur';
  if (db) {
    const cached = await db.getCache<Record<string, number>>(CACHE_KEY);
    if (cached) return cached;
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR');
    if (res.ok) {
      const data = await res.json() as any;
      if (data && data.rates) {
        if (db) {
          // Cache for 24 hours
          await db.setCache(CACHE_KEY, data.rates, 24 * 60 * 60);
        }
        return data.rates;
      }
    }
  } catch (err) {
    console.error('Failed to fetch exchange rates:', err);
  }
  return null;
}

export async function fetchImoovaOffers(
  route: UserRoute,
  windowDates: { start: string; end: string },
  db?: DbClient
): Promise<NormalizedOffer[]> {
  const isWildOrigin = !route.origin_id || route.origin_id === '*';
  let gqlFilter = '';
  if (!isWildOrigin && (route.origin_id || route.origin_name)) {
    const slug = String(route.origin_id || route.origin_name).toLowerCase().trim();
    gqlFilter = `, whereDepartureCity: {column: SLUG, operator: EQ, value: "${slug}"}`;
  }

  let res: any = null;
  try {
    res = await fetchJson<any>('https://api.imoova.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.imoova.com',
      },
      body: JSON.stringify({
        query: `query GetRelocations { relocations(first: 100${gqlFilter}) { data { id name available_from_date available_to_date hire_unit_rate retail_rate currency vehicle { name } departureCity { id name slug } deliveryCity { id name slug } } } }`,
        operationName: 'GetRelocations',
      }),
      retries: 1,
    });
  } catch (err) {
    return [];
  }

  const items = res?.data?.relocations?.data || [];
  const offers: NormalizedOffer[] = [];
  const rates = await getExchangeRates(db);

  for (const item of items) {
    const dep = item.departureCity || {};
    const deliv = item.deliveryCity || {};

    const depCountry = IMOOVA_COUNTRIES[dep.name] || '';
    const delivCountry = IMOOVA_COUNTRIES[deliv.name] || '';

    if (route.origin_country && route.origin_country !== '*' && route.origin_country !== 'ALL' && route.origin_country !== 'ANY' && depCountry) {
      const ocs = route.origin_country.toUpperCase().split(',').map(c => c.trim());
      if (!ocs.includes(depCountry.toUpperCase())) continue;
    }
    if (route.destination_country && route.destination_country !== '*' && route.destination_country !== 'ALL' && route.destination_country !== 'ANY' && delivCountry) {
      const dcs = route.destination_country.toUpperCase().split(',').map(c => c.trim());
      if (!dcs.includes(delivCountry.toUpperCase())) continue;
    }

    let price = Number(item.hire_unit_rate || item.retail_rate || 1);
    const vehicleName = item.vehicle?.name || item.name || 'Imoova Camper';
    const pickupDate = item.available_from_date || windowDates.start;
    const returnDate = item.available_to_date || windowDates.end;

    const curr = (item.currency || 'EUR').toUpperCase();
    if (curr !== 'EUR') {
      if (rates && rates[curr]) {
        price = price / rates[curr];
      } else {
        // Fallback approximate conversion
        if (curr === 'NZD') price *= 0.55;
        else if (curr === 'AUD') price *= 0.60;
        else if (curr === 'USD') price *= 0.92;
        else if (curr === 'GBP') price *= 1.17;
        else if (curr === 'CAD') price *= 0.68;
        else if (curr === 'CHF') price *= 1.05;
        else console.warn(`Unknown currency without API fallback: ${curr}`);
      }
    }

    // Round to 2 decimals
    price = Math.round(price * 100) / 100;

    offers.push({
      source: 'imoova',
      offer_id: String(item.id),
      origin: dep.name || 'Unknown',
      origin_country: depCountry || route.origin_country || '',
      destination: deliv.name || 'Unknown',
      destination_country: delivCountry || route.destination_country || '',
      pickup_date: pickupDate,
      return_date: returnDate,
      price: price,
      currency: 'EUR',
      vehicle: vehicleName,
      vehicle_type: 'camper',
      booking_url: `https://www.imoova.com/relocations/${item.id}`,
      operator_name: 'Imoova',
      sleeping_places: 4,
      raw_json: JSON.stringify(item),
    });
  }

  return offers;
}
