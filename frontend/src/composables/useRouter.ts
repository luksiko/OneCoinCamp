import { ref, onMounted, onUnmounted } from 'vue';

export type AppTab = 'main' | 'offers' | 'trackings' | 'settings' | 'admin';

const VALID_TABS: AppTab[] = ['main', 'offers', 'trackings', 'settings', 'admin'];

function getTabFromHash(): AppTab {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase() as AppTab;
  return VALID_TABS.includes(hash) ? hash : 'main';
}

const currentTab = ref<AppTab>(getTabFromHash());

/** offerId to highlight after navigation from a Telegram alert deep-link */
export const highlightedOfferId = ref<string | null>(null);

/** Parse ?offer=ID from the URL and switch to offers tab */
function parseDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const offerId = params.get('offer');
  if (offerId) {
    highlightedOfferId.value = offerId;
    currentTab.value = 'offers';
    window.location.hash = '#offers';
    // Strip the ?offer= param from the URL without reloading
    const clean = window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', clean);
  }
}

parseDeepLink();

export function useRouter() {
  function switchTab(tab: AppTab) {
    if (!VALID_TABS.includes(tab)) return;
    currentTab.value = tab;
    window.location.hash = `#${tab}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Telegram haptic feedback if available
    try {
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
    } catch {}
  }

  function handleHashChange() {
    currentTab.value = getTabFromHash();
  }

  onMounted(() => {
    window.addEventListener('hashchange', handleHashChange);
  });

  onUnmounted(() => {
    window.removeEventListener('hashchange', handleHashChange);
  });

  return {
    currentTab,
    switchTab,
  };
}
