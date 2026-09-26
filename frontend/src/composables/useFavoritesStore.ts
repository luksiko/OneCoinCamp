import { ref, watch } from 'vue';
import type { Offer } from '../api/types';

const FAVORITES_KEY = 'onecoincamp_favorites_offers';

const getInitialFavorites = (): Offer[] => {
  try {
    const item = localStorage.getItem(FAVORITES_KEY);
    if (item) {
      return JSON.parse(item);
    }
  } catch (e) {
    console.error('Failed to parse favorites from localStorage', e);
  }
  return [];
};

const favorites = ref<Offer[]>(getInitialFavorites());

watch(favorites, (newVal) => {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(newVal));
}, { deep: true });

export function useFavoritesStore() {
  const toggleFavorite = (offer: Offer) => {
    const index = favorites.value.findIndex(f => f.offerId === offer.offerId);
    if (index === -1) {
      favorites.value.push(offer);
    } else {
      favorites.value.splice(index, 1);
    }
  };

  const isFavorite = (offerId: string) => {
    return favorites.value.some(f => f.offerId === offerId);
  };

  return {
    favorites,
    toggleFavorite,
    isFavorite,
  };
}
