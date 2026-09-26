import { ref, computed } from 'vue';
import { api } from '../api/rpc';
import { useI18n } from './useI18n';
import type { AppStateData, Route, ProvidersHealth, UserSettings, UserFilters } from '../api/types';

const appState = ref<AppStateData | null>(null);
const isLoading = ref(false);
const isSaving = ref(false);
const loadError = ref<string | null>(null);
const providersHealth = ref<ProvidersHealth | null>(null);
const isHealthLoading = ref(false);

const toastMessage = ref<string | null>(null);
const toastIsError = ref(false);
let toastTimer: any = null;

const isPaymentModalOpen = ref(false);
const isRouteModalOpen = ref(false);
const editingRoute = ref<Route | null>(null);
const editingRouteIndex = ref<number | null>(null);

let saveAbortController: AbortController | null = null;

export function useAppStore() {
  const { t } = useI18n();
  function showToast(message: string, isError = false) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage.value = message;
    toastIsError.value = isError;
    toastTimer = setTimeout(() => {
      toastMessage.value = null;
    }, 3000);
  }

  async function loadAppData() {
    isLoading.value = true;
    loadError.value = null;
    try {
      const data = await api.getUiData();
      appState.value = data;
    } catch (err: any) {
      loadError.value = err.message || 'Ошибка загрузки данных';
      showToast(loadError.value || '', true);
    } finally {
      isLoading.value = false;
    }
  }

  async function saveAppData(updatedFilters?: Partial<UserFilters>, updatedRoutes?: Route[], updatedSettings?: Partial<UserSettings>) {
    if (!appState.value) return;
    isSaving.value = true;
    
    if (saveAbortController) {
      saveAbortController.abort();
    }
    saveAbortController = new AbortController();

    try {
      const currentFilters: UserFilters = {
        ...appState.value.filters,
        ...(updatedFilters || {}),
      };

      const currentSettings: UserSettings = {
        ...appState.value.settings,
        ...(updatedSettings || {}),
      };

      const currentRoutes = (updatedRoutes !== undefined ? updatedRoutes : appState.value.routes).map(r => ({
        source: r.source,
        enabled: r.enabled,
        originCountry: r.originCountry,
        destinationCountry: r.destinationCountry,
        originName: r.originName || '',
        originId: r.originId || '',
        destinationName: r.destinationName || '',
        destinationId: r.destinationId || '',
        pickupDate: r.pickupDate || '',
        returnDate: r.returnDate || '',
      }));

      const res = await api.saveUiData({
        routes: currentRoutes,
        filters: currentFilters,
        settings: currentSettings,
        language: appState.value.language,
      }, { signal: saveAbortController.signal });

      if (res.error) {
        throw new Error(res.error);
      }

      appState.value.filters = currentFilters;
      appState.value.settings = currentSettings;
      appState.value.routes = currentRoutes;
      showToast(t('toast_settings_saved') || 'Настройки сохранены');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Ошибка сохранения', true);
      }
    } finally {
      if (saveAbortController && !saveAbortController.signal.aborted) {
        isSaving.value = false;
      }
    }
  }

  async function checkHealth() {
    isHealthLoading.value = true;
    try {
      const h = await api.checkProvidersHealth();
      providersHealth.value = h;
    } catch (err: any) {
      showToast(err.message || 'Ошибка проверки провайдеров', true);
    } finally {
      isHealthLoading.value = false;
    }
  }

  async function triggerManualCheck() {
    try {
      showToast(t('toast_scan_started') || 'Запуск проверки...');
      await api.triggerMonitor();
      showToast(t('toast_scan_success') || 'Проверка успешно запущена');
      setTimeout(loadAppData, 2000);
    } catch (err: any) {
      showToast(err.message || 'Ошибка запуска проверки', true);
    }
  }

  function openRouteModal(index: number | null = null) {
    editingRouteIndex.value = index;
    if (index !== null && appState.value?.routes[index]) {
      editingRoute.value = JSON.parse(JSON.stringify(appState.value.routes[index]));
    } else {
      editingRoute.value = {
        source: 'roadsurfer',
        enabled: true,
        originCountry: 'DE',
        destinationCountry: 'DE',
        originName: '',
        destinationName: '',
        pickupDate: '',
        returnDate: '',
      };
    }
    isRouteModalOpen.value = true;
  }

  function closeRouteModal() {
    isRouteModalOpen.value = false;
    editingRoute.value = null;
    editingRouteIndex.value = null;
  }

  function saveRoute(route: Route) {
    if (!appState.value) return;
    const currentRoutes = [...appState.value.routes];
    if (editingRouteIndex.value !== null && editingRouteIndex.value >= 0) {
      currentRoutes[editingRouteIndex.value] = route;
    } else {
      currentRoutes.push(route);
    }
    closeRouteModal();
    saveAppData(undefined, currentRoutes);
  }

  function deleteRoute(index: number) {
    if (!appState.value) return;
    const currentRoutes = appState.value.routes.filter((_, i) => i !== index);
    saveAppData(undefined, currentRoutes);
    showToast(t('toast_route_deleted') || 'Маршрут удалён');
  }

  function toggleRoute(index: number) {
    if (!appState.value) return;
    const currentRoutes = [...appState.value.routes];
    currentRoutes[index].enabled = !currentRoutes[index].enabled;
    saveAppData(undefined, currentRoutes);
  }

  const isAdmin = computed(() => Boolean(appState.value?.isAdmin || appState.value?.user?.role === 'admin'));
  const isPremium = computed(() => {
    const status = appState.value?.user?.subscriptionStatus;
    return status === 'active' || status === 'trial' || isAdmin.value;
  });

  return {
    appState,
    isLoading,
    isSaving,
    loadError,
    providersHealth,
    isHealthLoading,
    toastMessage,
    toastIsError,
    isPaymentModalOpen,
    isRouteModalOpen,
    editingRoute,
    editingRouteIndex,
    isAdmin,
    isPremium,
    showToast,
    loadAppData,
    saveAppData,
    checkHealth,
    triggerManualCheck,
    openRouteModal,
    closeRouteModal,
    saveRoute,
    deleteRoute,
    toggleRoute,
  };
}
