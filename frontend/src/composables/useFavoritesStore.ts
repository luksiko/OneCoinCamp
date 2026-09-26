import { ref, onMounted, watch } from 'vue';
import type { Offer } from '../api/types';
import { api } from '../api/rpc';
import { useAuth } from './useAuth';

const favorites = ref<Offer[]>([]);
const isLoaded = ref(false);

export function useFavoritesStore() {
  const { isAuthenticated } = useAuth();

  const loadFavorites = async () => {
    if (!isAuthenticated.value) return;
    try {
      const data = await api.getFavorites();
      favorites.value = data || [];
      isLoaded.value = true;
    } catch (e) {
      console.error('Failed to load favorites', e);
    }
  };

  const toggleFavorite = async (offer: Offer) => {
    if (!isAuthenticated.value) return;
    
    // Optimistic UI update
    const key = offer.fingerprint || offer.offerId;
    const index = favorites.value.findIndex(f => (f.fingerprint || f.offerId) === key);
    let isAdding = false;
    if (index === -1) {
      favorites.value.unshift(offer); // Add to top
      isAdding = true;
    } else {
      favorites.value.splice(index, 1);
    }

    // Call API
    try {
      const added = await api.toggleFavorite(key);
      // Sync state if optimistic update was wrong
      if (added !== isAdding) {
        await loadFavorites();
      }
    } catch (e) {
      console.error('Failed to toggle favorite', e);
      await loadFavorites(); // Revert on error
    }
  };

  const isFavorite = (offerId: string) => {
    // Note: in template we pass fingerprint || offerId

    return favorites.value.some(f => (f.fingerprint || f.offerId) === offerId);
  };

  // Initial load if not loaded
  watch(isAuthenticated, (authed) => {
    if (authed && !isLoaded.value) {
      loadFavorites();
    }
  });

  onMounted(() => {
    if (!isLoaded.value && isAuthenticated.value) {
      loadFavorites();
    }
  });

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    loadFavorites
  };
}
