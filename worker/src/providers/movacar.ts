import { NormalizedOffer, UserRoute } from '../types';
import { fetchJson } from '../utils/http';
import countryMap from './movacar-countries.json';

export const MOVACAR_COUNTRIES: Record<string, string> = countryMap;

export async function getMovacarAllStations(): Promise<{ id: string; name: string; country: string }[]> {
  const payload = await fetchJson<any>('https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?locale=de', {
    headers: { Accept: 'application/vnd.api+json', Origin: 'https://movacar.com', Referer: 'https://movacar.com/' },
    retries: 1,
  });
  const stations = (payload?.included || [])
    .filter((item: any) => item.type === 'locationsummary' && item.attributes?.location_type === 'origin' && item.attributes?.reference)
    .map((item: any) => ({ id: String(item.attributes.reference), name: String(item.attributes.name || ''), country: MOVACAR_COUNTRIES[item.attributes.name] || '' }));
  return [...new Map<string, { id: string; name: string; country: string }>(stations.map((station: { id: string; name: string; country: string }) => [station.id, station])).values()];
}

export async function fetchMovacarOffers(
  route: UserRoute,
  windowDates: { start: string; end: string }
): Promise<NormalizedOffer[]> {
  const isWildOrigin = !route.origin_id || route.origin_id === '*';
  const isWildDest = !route.destination_id || route.destination_id === '*';
  const offers: NormalizedOffer[] = [];
  let origins: { id: string; name: string; country: string }[];
  if (isWildOrigin) {
    origins = (await getMovacarAllStations()).filter((station) => !route.origin_country || station.country === route.origin_country.toUpperCase());
  } else {
    origins = [{ id: String(route.origin_id), name: route.origin_name || '', country: route.origin_country || '' }];
  }

  for (const origin of origins) {
    let url = `https://crowd-api-production-615013621295.europe-west1.run.app/v1/offers?locale=en&origin=${encodeURIComponent(origin.id)}`;
    if (!isWildDest && route.destination_id) url += `&destination=${encodeURIComponent(route.destination_id)}`;
    if (windowDates.start) url += `&pickup_date_from=${encodeURIComponent(windowDates.start)}`;
    let payload: any;
    try {
      payload = await fetchJson<any>(url, {
        headers: { Accept: 'application/vnd.api+json', Origin: 'https://movacar.com', Referer: 'https://movacar.com/' },
        retries: 1,
      });
    } catch (error) {
      console.warn('Movacar origin fetch failed', origin.id, error);
      continue;
    }
    const stations: Record<string, any> = {};
    const prices: Record<string, any> = {};
    for (const item of payload?.included || []) {
      if (item.type === 'station') stations[item.id] = item.attributes;
      else if (item.type === 'monetary_amount') prices[item.id] = item.attributes;
    }

  for (const item of payload?.data || []) {
    if (item.type !== 'offer') continue;

    const attrs = item.attributes || {};
    const rels = item.relationships || {};

    const originData = rels.origin?.data || {};
    const originStation = stations[originData.id] || {};
    const originCity = originStation.city || originStation.alternative_city || origin.name || 'Unknown';
    const originCountry = MOVACAR_COUNTRIES[originCity] || origin.country || route.origin_country || '';

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

    const bookingUrl = `https://www.movacar.com/offers?origin=${encodeURIComponent(originCity)}&oid=${encodeURIComponent(origin.id)}&destination=${encodeURIComponent(destCity)}${destStation.reference ? `&did=${encodeURIComponent(destStation.reference)}` : ''}`;

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
  }

  return offers;
}
