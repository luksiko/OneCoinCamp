import { NormalizedOffer, UserRoute, UserFilters, GlobalSettings } from '../types';

export function parseCountryList(value: string | string[] | undefined | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((c) => c.trim().toUpperCase());
  return String(value)
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

export function parseIsoDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function routeMatchesOffer(route: UserRoute, offer: NormalizedOffer): boolean {
  if (!route || !route.enabled || !offer) return false;
  
  const routeSources = (route.source || '').toLowerCase().split(',').map(s => s.trim());
  const offerSource = (offer.source || '').toLowerCase().trim();
  if (!routeSources.includes('*') && !routeSources.includes('all') && !routeSources.includes('any') && !routeSources.includes(offerSource)) {
    return false;
  }

  // 1. Country checks
  const rOrigCountry = (route.origin_country || '').trim().toUpperCase();
  if (rOrigCountry && rOrigCountry !== '*' && rOrigCountry !== 'ANY' && rOrigCountry !== 'ALL' && offer.origin_country) {
    const allowed = rOrigCountry.split(',').map(c => c.trim());
    if (!allowed.includes(offer.origin_country.trim().toUpperCase())) return false;
  }

  const rDestCountry = (route.destination_country || '').trim().toUpperCase();
  if (rDestCountry && rDestCountry !== '*' && rDestCountry !== 'ANY' && rDestCountry !== 'ALL' && offer.destination_country) {
    const allowed = rDestCountry.split(',').map(c => c.trim());
    if (!allowed.includes(offer.destination_country.trim().toUpperCase())) return false;
  }

  // 2. City / Station checks
  function isWildcardCity(name?: string): boolean {
    if (!name) return true;
    const s = name.trim().toLowerCase();
    return s === '*' || s === 'all' || s === 'any' ||
      s === 'все города' || s === 'всі міста' || s === 'all cities' ||
      s === 'alle städte' || s === 'tutte le città' ||
      s.includes('все города') || s.includes('all cities') ||
      s.includes('alle städte') || s.includes('tutte le città') ||
      s.includes('всі міста');
  }

  function matchLoc(routeLoc?: string, offerLoc?: string, routeId?: string, offerId?: string): boolean {
    if (routeId && (routeId.trim() === '*' || routeId.trim().toUpperCase() === 'ALL' || routeId.trim().toUpperCase() === 'ANY')) return true;
    const rLoc = (routeLoc || '').trim();
    if (!rLoc || rLoc === '*' || rLoc.toUpperCase() === 'ALL' || isWildcardCity(rLoc)) return true;
    if (routeId && offerId && routeId.trim() === offerId.trim()) return true;
    if (offerLoc && rLoc.toLowerCase() === offerLoc.trim().toLowerCase()) return true;
    return false;
  }

  const origMatch = matchLoc(route.origin_name, offer.origin, route.origin_id);
  const destMatch = matchLoc(route.destination_name, offer.destination, route.destination_id);
  if (!origMatch || !destMatch) return false;

  // 3. Date check if route specifies custom pickup/return
  const rPickup = parseIsoDate(route.pickup_date);
  const rReturn = parseIsoDate(route.return_date);
  const offerPickup = parseIsoDate(offer.pickup_date);

  if (offerPickup) {
    if (rPickup && offerPickup < rPickup) return false;
    if (rReturn && offerPickup > rReturn) return false;
  }

  return true;
}

export function offerMatchesUserFilters(
  offer: NormalizedOffer,
  filters: UserFilters,
  matchedRoute?: UserRoute
): boolean {
  // 1. Vehicle type filter
  if (!matchedRoute) {
    if (filters.only_campers && offer.vehicle_type !== 'camper') {
      return false;
    }
    if (filters.vehicle_type && filters.vehicle_type !== 'all' && filters.vehicle_type !== '*') {
      if (filters.vehicle_type.toLowerCase() !== (offer.vehicle_type || 'camper').toLowerCase()) {
        return false;
      }
    }

    // Country filters
    const origins = parseCountryList(filters.allowed_origin_countries);
    const dests = parseCountryList(filters.allowed_destination_countries);

    if (origins.length > 0 && offer.origin_country && !origins.includes(offer.origin_country.toUpperCase())) {
      return false;
    }
    if (dests.length > 0 && offer.destination_country && !dests.includes(offer.destination_country.toUpperCase())) {
      return false;
    }
  }

  // 2. Price filter
  if (filters.max_price != null && filters.max_price !== undefined) {
    const max = Number(filters.max_price);
    if (!isNaN(max) && max >= 0) {
      if (offer.price > max) return false;
    }
  }

  // 3. Window days check
  const pickup = parseIsoDate(offer.pickup_date);
  if (pickup && filters.window_days && !matchedRoute?.pickup_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveDays = offer.source === 'roadsurfer' ? Math.max(filters.window_days, 45) : filters.window_days;
    const end = addDays(today, effectiveDays);
    if (pickup < today || pickup > end) {
      return false;
    }
  }

  // 4. Trip duration check
  const dropoff = parseIsoDate(offer.return_date);
  if (pickup && dropoff) {
    const durationDays = Math.round((dropoff.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24));
    if (filters.min_duration_days != null && durationDays < filters.min_duration_days) {
      return false;
    }
    if (filters.max_duration_days != null && durationDays > filters.max_duration_days) {
      return false;
    }
  }

  return true;
}

export function isSilentHoursActive(filters: UserFilters, settings: GlobalSettings, now = new Date()): boolean {
  if (!filters.silent_hours_enabled) return false;

  const startStr = filters.silent_hours_start || '23:00';
  const endStr = filters.silent_hours_end || '07:00';

  const startMatch = startStr.match(/^(\d{1,2}):(\d{2})$/);
  const endMatch = endStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!startMatch || !endMatch) return false;

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);

  // Format now in timezone (e.g. Europe/Berlin)
  const tz = settings.timezone || 'Europe/Berlin';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  let hour = 0;
  let min = 0;
  for (const p of parts) {
    if (p.type === 'hour') hour = Number(p.value);
    if (p.type === 'minute') min = Number(p.value);
  }
  const currentMinutes = hour * 60 + min;

  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}
