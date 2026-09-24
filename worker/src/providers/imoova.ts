import { NormalizedOffer, UserRoute } from '../types';
import { fetchJson } from '../utils/http';

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

export async function fetchImoovaOffers(
  route: UserRoute,
  windowDates: { start: string; end: string }
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

  for (const item of items) {
    const dep = item.departureCity || {};
    const deliv = item.deliveryCity || {};

    const depCountry = IMOOVA_COUNTRIES[dep.name] || '';
    const delivCountry = IMOOVA_COUNTRIES[deliv.name] || '';

    if (route.origin_country && depCountry && depCountry.toUpperCase() !== route.origin_country.toUpperCase()) {
      continue;
    }
    if (route.destination_country && delivCountry && delivCountry.toUpperCase() !== route.destination_country.toUpperCase()) {
      continue;
    }

    const price = item.hire_unit_rate || item.retail_rate || 1;
    const vehicleName = item.vehicle?.name || item.name || 'Imoova Camper';
    const pickupDate = item.available_from_date || windowDates.start;
    const returnDate = item.available_to_date || windowDates.end;

    offers.push({
      source: 'imoova',
      offer_id: String(item.id),
      origin: dep.name || 'Unknown',
      origin_country: depCountry || route.origin_country || '',
      destination: deliv.name || 'Unknown',
      destination_country: delivCountry || route.destination_country || '',
      pickup_date: pickupDate,
      return_date: returnDate,
      price: Number(price),
      currency: item.currency || 'EUR',
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
