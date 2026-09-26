import { NormalizedOffer, UserRoute } from '../types';
import { fetchJson } from '../utils/http';

export const INDIECAMPERS_CITIES: Record<string, string> = {
  'berlin': 'DE', 'munich': 'DE', 'frankfurt': 'DE', 'hamburg': 'DE', 'cologne': 'DE', 'stuttgart': 'DE',
  'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR', 'bordeaux': 'FR', 'nice': 'FR', 'toulouse': 'FR',
  'rome': 'IT', 'milan': 'IT', 'venice': 'IT', 'florence': 'IT', 'naples': 'IT', 'catania': 'IT',
  'madrid': 'ES', 'barcelona': 'ES', 'malaga': 'ES', 'seville': 'ES', 'bilbao': 'ES', 'valencia': 'ES',
  'lisbon': 'PT', 'porto': 'PT', 'faro': 'PT',
  'amsterdam': 'NL', 'brussels': 'BE', 'vienna': 'AT', 'zurich': 'CH', 'geneva': 'CH',
  'dublin': 'IE', 'edinburgh': 'GB', 'london': 'GB',
  'split': 'HR', 'zagreb': 'HR', 'dubrovnik': 'HR',
};

export async function fetchIndieCampersOffers(
  route: UserRoute,
  windowDates: { start: string; end: string }
): Promise<NormalizedOffer[]> {
  const checkinCity = String(route.origin_id || route.origin_name || 'berlin').toLowerCase().trim();
  const checkoutCity = String(route.destination_id || route.destination_name || 'rome').toLowerCase().trim();

  const pickupDate = windowDates.start || '2026-10-01';
  const returnDate = windowDates.end || '2026-10-10';

  const payload = {
    booking: {
      checkin_city: checkinCity,
      checkout_city: checkoutCity,
      checkin_datetime: `${pickupDate}T16:30:00+00:00`,
      checkout_datetime: `${returnDate}T11:00:00+00:00`,
      locale: 'en',
      legacy_search: false,
      van_category: '',
      limit: 50,
      offset: 0,
      only_marketplace: false,
    },
    filters: {},
    meta: { current_route: 'rent-an-rv-search' },
  };

  let res: any = null;
  try {
    res = await fetchJson<any>('https://edge.indiecampers.com/api/v3/availability', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://indiecampers.com',
      },
      body: JSON.stringify(payload),
      retries: 1,
    });
  } catch (err) {
    return [];
  }

  const items = res?.data?.availability || [];
  const bookingUrl = `https://indiecampers.com/rent-an-rv/search?from=${checkinCity}&to=${checkoutCity}&start=${pickupDate}&end=${returnDate}`;
  const offers: NormalizedOffer[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.available === false) continue;

    const vanId = item.van_id || item.van_category || `ic_${i}`;
    const price = item.total_cost || item.daily_cost || 1;
    const vehicle = item.manufacturer_name || item.van_category || 'Indie Camper';

    offers.push({
      source: 'indiecampers',
      offer_id: `${vanId}_${checkinCity}_${checkoutCity}`,
      origin: route.origin_name || checkinCity,
      origin_country: INDIECAMPERS_CITIES[checkinCity] || route.origin_country || '',
      destination: route.destination_name || checkoutCity,
      destination_country: INDIECAMPERS_CITIES[checkoutCity] || route.destination_country || '',
      pickup_date: item.checkin_date || pickupDate,
      return_date: item.checkout_date || returnDate,
      price: Number(price),
      currency: 'EUR',
      vehicle: String(vehicle),
      vehicle_type: 'camper',
      booking_url: bookingUrl,
      image_url: item.image_url || item.image || item.photo_url || item.picture_url || undefined,
      operator_name: 'Indie Campers',
      sleeping_places: 4,
      raw_json: JSON.stringify(item),
    });
  }

  return offers;
}
