import { ref, onMounted, onUnmounted } from 'vue';

export type AppTab = 'main' | 'offers' | 'analytics' | 'settings' | 'admin';

const VALID_TABS: AppTab[] = ['main', 'offers', 'analytics', 'settings', 'admin'];

function getTabFromHash(): AppTab {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase() as AppTab;
  return VALID_TABS.includes(hash) ? hash : 'main';
}

const currentTab = ref<AppTab>(getTabFromHash());

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
