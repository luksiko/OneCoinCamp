<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, type AppTab } from '../../composables/useRouter';
import { useI18n } from '../../composables/useI18n';
import { useAppStore } from '../../composables/useAppStore';
import { Home, Compass, BarChart3, Settings, ShieldCheck } from 'lucide-vue-next';

const { currentTab, switchTab } = useRouter();
const { t } = useI18n();
const { isAdmin } = useAppStore();

const tabs = computed<Array<{ id: AppTab; label: string; icon: any }>>(() => {
  const base = [
    { id: 'main' as AppTab, label: t('tab_main'), icon: Home },
    { id: 'offers' as AppTab, label: t('tab_offers'), icon: Compass },
    { id: 'analytics' as AppTab, label: t('tab_analytics'), icon: BarChart3 },
    { id: 'settings' as AppTab, label: t('tab_settings'), icon: Settings },
  ];
  if (isAdmin.value) {
    base.push({ id: 'admin' as AppTab, label: t('tab_admin') || 'Admin', icon: ShieldCheck });
  }
  return base;
});
</script>

<template>
  <nav class="bottom-dock">
    <div class="dock-inner">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="dock-item"
        :class="{ active: currentTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        <component :is="tab.icon" :size="20" class="dock-icon" />
        <span class="dock-label">{{ tab.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.bottom-dock {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 8px));
  background: rgba(11, 15, 23, 0.88);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: center;
}

@media (min-width: 768px) {
  .bottom-dock {
    display: none;
  }
}

.dock-inner {
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  max-width: 480px;
  gap: 4px;
}

.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex: 1;
  padding: 6px 0;
  background: transparent;
  border: none;
  color: var(--text-subtle);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all 0.16s ease;
}

.dock-item.active {
  color: var(--accent-primary);
}

.dock-item.active .dock-icon {
  transform: translateY(-1px);
}

.dock-icon {
  transition: transform 0.16s ease;
}

.dock-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
</style>
