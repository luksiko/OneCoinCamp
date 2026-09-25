<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, type AppTab } from '../../composables/useRouter';
import { useI18n, type SupportedLang } from '../../composables/useI18n';
import { useAppStore } from '../../composables/useAppStore';
import { useAuth } from '../../composables/useAuth';
import { 
  Home, 
  Compass, 
  BarChart3, 
  Settings, 
  ShieldCheck, 
  Crown, 
  Globe, 
  LogOut 
} from 'lucide-vue-next';

const { currentTab, switchTab } = useRouter();
const { currentLang, setLanguage, t } = useI18n();
const { appState, isAdmin, isPremium } = useAppStore();
const { isTelegramMiniApp, isAuthenticated, logout } = useAuth();

const languages: Array<{ code: SupportedLang; label: string }> = [
  { code: 'ru', label: 'RU' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'it', label: 'IT' },
  { code: 'uk', label: 'UK' },
];

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
  <header class="header">
    <div class="header-inner">
      <!-- Logo & Branding -->
      <div class="logo-area" @click="switchTab('main')">
        <div class="logo-icon">🚐</div>
        <div class="logo-text">
          <div class="logo-title">OneCoinCamp</div>
          <div class="status-indicator">
            <span class="pulsing-dot"></span>
            <span class="status-label">Live Monitor</span>
          </div>
        </div>
      </div>

      <!-- Desktop Navigation Tabs -->
      <nav class="desktop-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="nav-tab"
          :class="{ active: currentTab === tab.id }"
          @click="switchTab(tab.id)"
        >
          <component :is="tab.icon" class="tab-icon" :size="16" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>

      <!-- Actions Area: Lang, Subscription Badge, Logout -->
      <div class="actions-area">
        <!-- Language Switcher -->
        <div class="lang-selector">
          <Globe :size="14" class="lang-icon" />
          <select
            :value="currentLang"
            class="lang-select"
            @change="(e) => setLanguage((e.target as HTMLSelectElement).value as SupportedLang)"
          >
            <option v-for="lang in languages" :key="lang.code" :value="lang.code">
              {{ lang.label }}
            </option>
          </select>
        </div>

        <!-- Premium Status Badge -->
        <div v-if="appState?.user" class="user-badge" :class="{ 'is-premium': isPremium }">
          <Crown v-if="isPremium" :size="13" class="crown-icon" />
          <span>{{ isPremium ? 'PRO' : 'FREE' }}</span>
        </div>

        <!-- Browser Logout (Visible only in desktop browser sessions) -->
        <button
          v-if="!isTelegramMiniApp && isAuthenticated"
          class="logout-btn"
          title="Выйти"
          @click="logout"
        >
          <LogOut :size="15" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(11, 15, 23, 0.85);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border-subtle);
  padding: 10px 16px;
}

.header-inner {
  max-width: 1080px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.logo-icon {
  font-size: 24px;
}

.logo-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-main);
  line-height: 1.1;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
}

.pulsing-dot {
  width: 6px;
  height: 6px;
  background: var(--success);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--success);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

.status-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-subtle);
}

/* Desktop nav tabs */
.desktop-nav {
  display: none;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.04);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}

@media (min-width: 768px) {
  .desktop-nav {
    display: flex;
  }
}

.nav-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
}

.nav-tab:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.06);
}

.nav-tab.active {
  background: var(--accent-gradient);
  color: #ffffff;
  box-shadow: 0 2px 8px var(--accent-glow);
}

/* Actions */
.actions-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lang-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  color: var(--text-muted);
}

.lang-select {
  background: transparent;
  border: none;
  color: var(--text-main);
  font-size: 12px;
  font-weight: 600;
  outline: none;
  cursor: pointer;
}

.user-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  border: 1px solid var(--border-subtle);
}

.user-badge.is-premium {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.2));
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.4);
}

.logout-btn {
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 6px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.16s ease;
}

.logout-btn:hover {
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.3);
  background: var(--danger-bg);
}
</style>
