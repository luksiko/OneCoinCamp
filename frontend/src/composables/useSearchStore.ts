import { ref } from 'vue';

export const globalSearchFilters = ref({
  originCountry: '',
  destinationCountry: '',
  dateFrom: '',
  dateTo: '',
  vehicleType: '',
});

export function useSearchStore() {
  function applySearch(filters: Partial<typeof globalSearchFilters.value>) {
    globalSearchFilters.value = {
      ...globalSearchFilters.value,
      ...filters,
    };
  }

  function resetSearch() {
    globalSearchFilters.value = {
      originCountry: '',
      destinationCountry: '',
      dateFrom: '',
      dateTo: '',
      vehicleType: '',
    };
  }

  return {
    globalSearchFilters,
    applySearch,
    resetSearch,
  };
}
