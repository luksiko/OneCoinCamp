<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { useI18n } from '../../composables/useI18n';
import { formatDateRange } from '../../utils/date';
import { 
  Sparkles, 
  Plus, 
  Play, 
  Edit3, 
  Trash2, 
  Calendar,
  Save
} from 'lucide-vue-next';

const { 
  appState, 
  isPremium, 
  isPaymentModalOpen, 
  triggerManualCheck, 
  openRouteModal,
  deleteRoute,
  toggleRoute,
  saveAppData,
  isSaving
} = useAppStore();

const { t, getCountryName, pluralizeDays, currentLang } = useI18n();

const routes = computed(() => appState.value?.routes || []);
const maxRoutes = computed(() => appState.value?.user?.maxRoutes ?? 1);
const canAddRoute = computed(() => isPremium.value || routes.value.length < maxRoutes.value);

const daysLeft = computed(() => {
  const expiresAt = appState.value?.user?.subscriptionExpiresAt;
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
});

function getProviderName(src: string) {
  const map: Record<string, string> = {
    roadsurfer: 'Roadsurfer',
    movacar: 'Movacar',
    indiecampers: 'Indie Campers',
    imoova: 'Imoova',
  };
  const parts = (src || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return 'Any Provider';
  if (parts.length === 4 || parts.includes('all') || parts.includes('any')) return 'All Providers';
  return parts.map(p => map[p] || p).join(', ');
}

function handleAddRoute() {
  if (!canAddRoute.value) {
    isPaymentModalOpen.value = true;
    return;
  }
  openRouteModal();
}

function handleSaveMain() {
  saveAppData();
}


</script>

<template>
  <div class="trackings-tab">
    <!-- Subscription Banner (Free Users) -->
    <div v-if="!isPremium" class="sub-banner glass-card" @click="isPaymentModalOpen = true">
      <div class="banner-content">
        <div class="banner-badge">{{ t('sub_free_plan') }}</div>
        <div class="banner-title">{{ t('sub_banner_title') }}</div>
        <div class="banner-sub">{{ t('sub_banner_desc') }}</div>
      </div>
      <button class="btn btn-primary banner-btn">
        <Sparkles :size="15" />
        <span>{{ t('subscribe_pro_btn') }}</span>
      </button>
    </div>

    <!-- Active Subscription Status (Premium Users) -->
    <div v-else class="premium-active-card glass-card">
      <div class="active-info">
        <div class="active-badge">{{ t('sub_pro_active') }}</div>
        <div class="active-text">
          {{ t('sub_days_left', { days: `${daysLeft} ${pluralizeDays(daysLeft)}` }) }}
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" @click="isPaymentModalOpen = true">
        <span>{{ t('extend_btn') }}</span>
      </button>
    </div>

    <!-- Scanner Status Card -->
    <div class="glass-card status-card">
      <div class="status-header">
        <div class="status-meta">
          <span class="status-indicator-dot"></span>
          <span class="status-title">{{ t('status_live_monitor') }}</span>
        </div>
        <div class="status-actions">
          <button class="btn btn-secondary btn-sm" @click="triggerManualCheck">
            <Play :size="13" />
            <span>{{ t('check_btn') }}</span>
          </button>
        </div>
      </div>
      <div class="status-details">
        <div class="status-item">
          <div class="status-item-label">{{ t('status_last_run') }}</div>
          <div class="status-item-value">
            {{ appState?.status?.lastRun?.finished_at ? new Date(appState.status.lastRun.finished_at).toLocaleTimeString() : (appState?.status?.lastRun?.timestamp ? new Date(appState.status.lastRun.timestamp).toLocaleTimeString() : '—') }}
          </div>
        </div>
        <div class="status-item">
          <div class="status-item-label">{{ t('status_interval') }}</div>
          <div class="status-item-value">{{ appState?.settings?.poll_interval_minutes || 5 }} {{ t('minutes') || 'мин' }}</div>
        </div>
        <div class="status-item">
          <div class="status-item-label">{{ t('routes_title') }}</div>
          <div class="status-item-value">{{ routes.filter(r => r.enabled).length }} / {{ routes.length }}</div>
        </div>
      </div>
    </div>

    <!-- Routes Management Section -->
    <div class="routes-section">
      <div class="section-header">
        <div class="section-title">
          <span>{{ t('routes_title') }}</span>
          <span class="badge badge-neutral">{{ routes.length }} / {{ isPremium ? '∞' : maxRoutes }}</span>
        </div>
        <div class="routes-header-actions">
          <button class="btn btn-primary btn-sm" @click="handleAddRoute">
            <Plus :size="14" />
            <span>{{ t('add_route') }}</span>
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="routes.length === 0" class="empty-card glass-card">
        <div class="empty-icon">📍</div>
        <div class="empty-title">{{ t('empty_routes') }}</div>
        <button class="btn btn-primary" style="margin-top: 14px;" @click="handleAddRoute">
          <Plus :size="15" />
          <span>{{ t('add_route') }}</span>
        </button>
      </div>

      <!-- Routes List -->
      <div v-else class="routes-grid">
        <div 
          v-for="(route, index) in routes" 
          :key="index" 
          class="offer-card glass-card"
          :class="{ disabled: !route.enabled }"
        >
          <div class="offer-header">
            <span class="provider-tag">{{ getProviderName(route.source) }}</span>
            <div class="header-right">
              <label class="toggle-switch">
                <input type="checkbox" :checked="route.enabled" @change="toggleRoute(index)" />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="route-display">
            <div class="route-node">
              <span class="node-city">{{ route.originName || getCountryName(route.originCountry) }}</span>
              <span class="node-country">{{ getCountryName(route.originCountry) }}</span>
            </div>
            <div class="route-arrow">➔</div>
            <div class="route-node">
              <span class="node-city">{{ route.destinationName || (route.destinationCountry ? getCountryName(route.destinationCountry) : 'Anywhere') }}</span>
              <span class="node-country" v-if="route.destinationCountry">{{ getCountryName(route.destinationCountry) }}</span>
            </div>
          </div>

          <div class="offer-meta">
            <div class="meta-item">
              <Calendar :size="13" />
              <span v-if="route.pickupDate || route.returnDate">
                {{ formatDateRange(route.pickupDate || '', route.returnDate || '', currentLang) }}
              </span>
              <span v-else>{{ t('any_dates') || 'Любые даты' }}</span>
            </div>
          </div>

          <div class="route-actions">
            <button class="action-btn" :title="t('edit_route')" @click="openRouteModal(index)">
              <Edit3 :size="14" />
            </button>
            <button class="action-btn delete-btn" :title="t('delete_btn')" @click="deleteRoute(index)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- Bottom Save Action Bar for Main Tab -->
      <div v-if="routes.length > 0" class="main-save-row">
        <button class="btn btn-primary" :disabled="isSaving" @click="handleSaveMain">
          <Save :size="15" />
          <span>{{ isSaving ? t('saving') : t('save_main') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trackings-tab {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

/* Sub banner */
.sub-banner {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.25) 0%, rgba(147, 51, 234, 0.25) 100%);
  border: 1px solid rgba(59, 130, 246, 0.35);
  display: flex;
  flex-direction: column;
  gap: 14px;
  cursor: pointer;
  padding: 18px 20px;
}

@media (min-width: 640px) {
  .sub-banner {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.banner-badge {
  font-size: 11px;
  font-weight: 800;
  color: #60a5fa;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}

.banner-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.3;
}

.banner-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
  line-height: 1.4;
}

.banner-btn {
  flex-shrink: 0;
}

/* Premium active card */
.premium-active-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
  border-color: rgba(16, 185, 129, 0.3);
}

.active-badge {
  font-size: 12px;
  font-weight: 800;
  color: #34d399;
  letter-spacing: 0.06em;
}

.active-text {
  font-size: 14px;
  color: var(--text-main);
  margin-top: 2px;
}

/* Status card */
.status-card {
  padding: 18px 20px;
}

.status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.status-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator-dot {
  width: 8px;
  height: 8px;
  background: var(--success);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--success);
}

.status-title {
  font-size: 14px;
  font-weight: 700;
}

.status-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.status-item-label {
  font-size: 11px;
  color: var(--text-muted);
}

.status-item-value {
  font-size: 14px;
  font-weight: 700;
  margin-top: 2px;
}

/* Routes section */
.routes-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.routes-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-card {
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 10px;
}

.empty-title {
  font-size: 15px;
  font-weight: 700;
}

.routes-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 640px) {
  .routes-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.offer-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: opacity 0.2s;
}

.offer-card.disabled {
  opacity: 0.6;
}

.offer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.provider-tag {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--accent-primary);
  background: rgba(59, 130, 246, 0.12);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.route-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.route-node {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.route-node:last-child {
  text-align: right;
}

.node-city {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main);
}

.node-country {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.route-arrow {
  color: var(--text-subtle);
  font-size: 16px;
  font-weight: 700;
}

.offer-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-top: 4px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.route-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.action-btn {
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

.action-btn:hover {
  color: var(--text-main);
  background: var(--bg-surface-elevated);
}

.action-btn.delete-btn:hover {
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.3);
}

.main-save-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 20px;
  flex-shrink: 0;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: rgba(255, 255, 255, 0.15);
  transition: 0.2s;
  border-radius: 20px;
}
.toggle-slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.2s;
  border-radius: 50%;
}
input:checked + .toggle-slider {
  background-color: var(--accent-primary);
}
input:checked + .toggle-slider:before {
  transform: translateX(18px);
}
</style>
