import { NormalizedOffer, UserRoute } from '../types';
import { fetchJson } from '../utils/http';

export const MOVACAR_COUNTRIES: Record<string, string> = {
  'Berlin': 'DE', 'Munich': 'DE', 'München': 'DE', 'Hamburg': 'DE', 'Frankfurt': 'DE',
  'Cologne': 'DE', 'Köln': 'DE', 'Stuttgart': 'DE', 'Düsseldorf': 'DE', 'Dusseldorf': 'DE',
  'Leipzig': 'DE', 'Dresden': 'DE', 'Hannover': 'DE', 'Nürnberg': 'DE', 'Nuremberg': 'DE',
  'Bremen': 'DE', 'Bonn': 'DE', 'Essen': 'DE', 'Dortmund': 'DE', 'Karlsruhe': 'DE',
  'Freiburg': 'DE', 'Mannheim': 'DE', 'Augsburg': 'DE', 'Regensburg': 'DE',
  'Wien': 'AT', 'Vienna': 'AT', 'Salzburg': 'AT', 'Innsbruck': 'AT', 'Graz': 'AT', 'Linz': 'AT',
  'Zürich': 'CH', 'Zurich': 'CH', 'Genf': 'CH', 'Geneva': 'CH', 'Basel': 'CH', 'Bern': 'CH',
  'Paris': 'FR', 'Lyon': 'FR', 'Marseille': 'FR', 'Nice': 'FR', 'Nizza': 'FR', 'Bordeaux': 'FR',
  'Toulouse': 'FR', 'Strasbourg': 'FR', 'Straßburg': 'FR', 'Nantes': 'FR',
  'Rom': 'IT', 'Rome': 'IT', 'Roma': 'IT', 'Mailand': 'IT', 'Milan': 'IT', 'Milano': 'IT',
  'Florenz': 'IT', 'Florence': 'IT', 'Firenze': 'IT', 'Neapel': 'IT', 'Naples': 'IT', 'Napoli': 'IT',
  'Venedig': 'IT', 'Venice': 'IT', 'Venezia': 'IT', 'Turin': 'IT', 'Torino': 'IT', 'Bologna': 'IT',
  'Madrid': 'ES', 'Barcelona': 'ES', 'Sevilla': 'ES', 'Seville': 'ES', 'Valencia': 'ES', 'Malaga': 'ES',
  'Lissabon': 'PT', 'Lisbon': 'PT', 'Lisboa': 'PT', 'Porto': 'PT', 'Faro': 'PT',
  'Amsterdam': 'NL', 'Rotterdam': 'NL', 'Den Haag': 'NL', 'Utrecht': 'NL', 'Eindhoven': 'NL',
  'Brüssel': 'BE', 'Brussels': 'BE', 'Bruxelles': 'BE', 'Antwerpen': 'BE', 'Gent': 'BE',
  'Kopenhagen': 'DK', 'Copenhagen': 'DK', 'Aarhus': 'DK',
  'Warschau': 'PL', 'Warsaw': 'PL', 'Krakau': 'PL', 'Krakow': 'PL', 'Danzig': 'PL', 'Gdansk': 'PL',
  'Prag': 'CZ', 'Prague': 'CZ', 'Brünn': 'CZ', 'Brno': 'CZ',
  'Zagreb': 'HR', 'Split': 'HR', 'Dubrovnik': 'HR', 'Zadar': 'HR', 'Pula': 'HR',
  'Ljubljana': 'SI', 'Maribor': 'SI',
  'Budapest': 'HU',
};

export async function fetchMovacarOffers(
  route: UserRoute,
  windowDates: { start: string; end: string }
): Promise<NormalizedOffer[]> {
  const isWildOrigin = !route.origin_id || route.origin_id === '*';
  const isWildDest = !route.destination_id || route.destination_id === '*';

  let url = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/offers?locale=en';
  if (!isWildOrigin && route.origin_id) {
    url += `&origin=${encodeURIComponent(route.origin_id)}`;
  }
  if (!isWildDest && route.destination_id) {
    url += `&destination=${encodeURIComponent(route.destination_id)}`;
  }
  if (windowDates.start) {
    url += `&pickup_date_from=${encodeURIComponent(windowDates.start)}`;
  }

  let payload: any = null;
  try {
    payload = await fetchJson<any>(url, {
      headers: {
        Accept: 'application/vnd.api+json',
        Origin: 'https://movacar.com',
        Referer: 'https://movacar.com/',
      },
      retries: 1,
    });
  } catch (err) {
    return [];
  }

  const included = payload?.included || [];
  const stations: Record<string, any> = {};
  const prices: Record<string, any> = {};

  for (const item of included) {
    if (item.type === 'station') {
      stations[item.id] = item.attributes;
    } else if (item.type === 'monetary_amount') {
      prices[item.id] = item.attributes;
    }
  }

  const data = payload?.data || [];
  const offers: NormalizedOffer[] = [];

  for (const item of data) {
    if (item.type !== 'offer') continue;

    const attrs = item.attributes || {};
    const rels = item.relationships || {};

    const originData = rels.origin?.data || {};
    const originStation = stations[originData.id] || {};
    const originCity = originStation.city || originStation.alternative_city || route.origin_name || 'Unknown';
    const originCountry = MOVACAR_COUNTRIES[originCity] || route.origin_country || '';

    const destData = rels.destination?.data || {};
    const destStation = stations[destData.id] || {};
    const destCity = destStation.city || destStation.alternative_city || route.destination_name || 'Unknown';
    const destCountry = MOVACAR_COUNTRIES[destCity] || route.destination_country || '';

    // Country filters
    if (route.origin_country && originCountry && originCountry.toUpperCase() !== route.origin_country.toUpperCase()) {
      continue;
    }
    if (route.destination_country && destCountry && destCountry.toUpperCase() !== route.destination_country.toUpperCase()) {
      continue;
    }

    const priceData = rels.base_price?.data || {};
    const priceInfo = prices[priceData.id];
    const priceVal = priceInfo ? priceInfo.amount_minor_units / 100 : 1;

    let vName = attrs.make || attrs.model || attrs.vehicle_category_name || 'Movacar vehicle';
    if (attrs.model && attrs.model !== vName) vName += ' ' + attrs.model;

    const isCamper =
      String(attrs.vehicle_category_name || '').toLowerCase().includes('camper') ||
      String(vName).toLowerCase().includes('camper') ||
      String(attrs.make || '').toLowerCase().includes('california');

    const pickupDate = attrs.start_date || windowDates.start;
    const returnDate = attrs.end_date || windowDates.end;

    const bookingUrl = `https://www.movacar.com/offers?origin=${encodeURIComponent(originCity)}&destination=${encodeURIComponent(destCity)}`;

    offers.push({
      source: 'movacar',
      offer_id: String(attrs.offer_id || item.id),
      vehicle: vName,
      vehicle_type: isCamper ? 'camper' : 'car',
      origin: originCity,
      origin_country: originCountry,
      destination: destCity,
      destination_country: destCountry,
      pickup_date: pickupDate,
      return_date: returnDate,
      price: priceVal,
      currency: 'EUR',
      booking_url: bookingUrl,
      operator_name: attrs.partner_name || 'Movacar',
      raw_json: JSON.stringify(item),
    });
  }

  return offers;
}
