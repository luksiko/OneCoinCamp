import { NormalizedOffer, UserRoute, UserFilters } from '../types';
import { fetchRoadsurferOffers } from './roadsurfer';
import { fetchMovacarOffers } from './movacar';
import { fetchIndieCampersOffers } from './indiecampers';
import { fetchImoovaOffers } from './imoova';

export async function fetchOffersForRoute(
  route: UserRoute,
  windowDates: { start: string; end: string },
  filters?: UserFilters
): Promise<NormalizedOffer[]> {
  const source = (route.source || '').toLowerCase().trim();
  switch (source) {
    case 'roadsurfer':
      return fetchRoadsurferOffers(route, windowDates, filters);
    case 'movacar':
      return fetchMovacarOffers(route, windowDates);
    case 'indiecampers':
      return fetchIndieCampersOffers(route, windowDates);
    case 'imoova':
      return fetchImoovaOffers(route, windowDates);
    default:
      console.warn(`Unknown provider source: ${source}`);
      return [];
  }
}
