<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuth } from './composables/useAuth';
import { useRouter } from './composables/useRouter';
import { useAppStore } from './composables/useAppStore';

import AppHeader from './components/layout/AppHeader.vue';
import BottomNav from './components/layout/BottomNav.vue';
import BrowserLoginModal from './components/layout/BrowserLoginModal.vue';

import MainTab from './components/tabs/MainTab.vue';
import OffersTab from './components/tabs/OffersTab.vue';
import AnalyticsTab from './components/tabs/AnalyticsTab.vue';
import SettingsTab from './components/tabs/SettingsTab.vue';
import AdminTab from './components/tabs/AdminTab.vue';

import RouteModal from './components/modals/RouteModal.vue';
import PaymentModal from './components/modals/PaymentModal.vue';
import Toast from './components/modals/Toast.vue';

const { isAuthenticated, checkInitialAuth } = useAuth();
const { currentTab } = useRouter();
const { loadAppData, isLoading, isAdmin } = useAppStore();

onMounted(async () => {
  checkInitialAuth();
  if (isAuthenticated.value) {
    await loadAppData();
  }
});
</script>

<template>
  <div class="app-root">
    <!-- Unauthenticated Browser User View -->
    <BrowserLoginModal v-if="!isAuthenticated" />

    <!-- Authenticated App View -->
    <template v-else>
      <AppHeader />

      <main class="app-container">
        <KeepAlive>
          <component
            :is="
              currentTab === 'offers'
                ? OffersTab
                : currentTab === 'analytics'
                ? AnalyticsTab
                : currentTab === 'settings'
                ? SettingsTab
                : currentTab === 'admin' && isAdmin
                ? AdminTab
                : MainTab
            "
          />
        </KeepAlive>
      </main>

      <BottomNav />
      <RouteModal />
      <PaymentModal />
    </template>

    <Toast />
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>
