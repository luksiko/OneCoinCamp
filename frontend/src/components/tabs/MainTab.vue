<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { useI18n } from '../../composables/useI18n';
import { 
  Sparkles, 
  Plus, 
  Play, 
  RefreshCw, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  MapPin, 
  Calendar 
} from 'lucide-vue-next';

const { 
  appState, 
  isPremium, 
  isPaymentModalOpen, 
  triggerManualCheck, 
  providersHealth, 
  isHealthLoading, 
  checkHealth,
  openRouteModal,
  deleteRoute,
  toggleRoute
} = useAppStore();

const { t, getCountryName, pluralizeDays } = useI18n();

const routes = computed(() => appState.value?.routes || []);
const maxRoutes = computed(() => appState.value?.user?.maxRoutes ?? 1);
const canAddRoute = computed(() => isPremium.value || routes.value.length < maxRoutes.value);

const daysLeft = computed(() => {
  const expiresAt = appState.value?.user?.subscriptionExpiresAt;
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
});
const subStatus = computed(() => appState.value?.user?.subscriptionStatus || 'inactive');

function getProviderName(src: string) {
  const map: Record<string, string> = {
    roadsurfer: 'Roadsurfer',
    movacar: 'Movacar',
    indiecampers: 'Indie Campers',
    imoova: 'Imoova',
  };
  return map[src] || src;
}

function handleAddRoute() {
  if (!canAddRoute.value) {
    isPaymentModalOpen.value = true;
    return;
  }
  openRouteModal();
}
</script>

<template>
  <div class="main-tab">
    <!-- Subscription Banner -->
    <div v-if="!isPremium" class="sub-banner glass-card" @click="isPaymentModalOpen = true">
      <div class="banner-content">
        <div class="banner-badge">FREE PLAN</div>
        <div class="banner-title">
          {{ t('sub_banner_title') || 'Разблокируйте все маршруты и мгновенные уведомления' }}
        </div>
        <div class="banner-sub">
          {{ t('sub_banner_desc') || 'Отслеживайте неограниченное число направлений и первыми бронируйте кемперы за 1€' }}
        </div>
      </div>
      <button class="btn btn-primary banner-btn">
        <Sparkles :size="15" />
        <span>PRO (€4.99)</span>
      </button>
    </div>

    <!-- Active Subscription Status (for Premium users) -->
    <div v-else class="premium-active-card glass-card">
      <div class="active-info">
        <div class="active-badge">⭐ PRO АКТИВЕН</div>
        <div class="active-text">
          Осталось <strong>{{ daysLeft }} {{ pluralizeDays(daysLeft) }}</strong> подписки
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" @click="isPaymentModalOpen = true">
        <span>Продлить</span>
      </button>
    </div>

    <!-- Scanner Status Card -->
    <div class="glass-card status-card">
      <div class="status-header">
        <div class="status-meta">
          <span class="status-indicator-dot"></span>
          <span class="status-title">{{ t('monitor_active') || 'Мониторинг 24/7' }}</span>
        </div>
        <button class="btn btn-secondary btn-sm" @click="triggerManualCheck">
          <Play :size="13" />
          <span>{{ t('btn_check_now') || 'Проверить сейчас' }}</span>
        </button>
      </div>
      <div class="status-details">
        <div class="status-item">
          <div class="status-item-label">{{ t('last_check') || 'Последняя проверка' }}</div>
          <div class="status-item-value">{{ appState?.status?.lastRun?.finished_at ? new Date(appState.status.lastRun.finished_at).toLocaleTimeString() : (appState?.status?.lastRun?.timestamp ? new Date(appState.status.lastRun.timestamp).toLocaleTimeString() : 'Недавно') }}</div>
        </div>
        <div class="status-item">
          <div class="status-item-label">{{ t('active_routes') || 'Активных маршрутов' }}</div>
          <div class="status-item-value">{{ routes.filter(r => r.enabled).length }} / {{ routes.length }}</div>
        </div>
      </div>
    </div>

    <!-- Routes Management Section -->
    <div class="routes-section">
      <div class="section-header">
        <div class="section-title">
          <span>{{ t('routes_title') || 'Маршруты' }}</span>
          <span class="badge badge-neutral">{{ routes.length }} / {{ isPremium ? '∞' : maxRoutes }}</span>
        </div>
        <button class="btn btn-primary btn-sm" @click="handleAddRoute">
          <Plus :size="14" />
          <span>{{ t('btn_add_route') || 'Добавить' }}</span>
        </button>
      </div>

      <!-- Empty State -->
      <div v-if="routes.length === 0" class="empty-card glass-card">
        <div class="empty-icon">📍</div>
        <div class="empty-title">{{ t('routes_empty_title') || 'Нет активных маршрутов' }}</div>
        <div class="empty-sub">{{ t('routes_empty_desc') || 'Добавьте направления, которые вы хотите отслеживать' }}</div>
        <button class="btn btn-primary" style="margin-top: 14px;" @click="handleAddRoute">
          <Plus :size="15" />
          <span>{{ t('btn_add_route') || 'Добавить маршрут' }}</span>
        </button>
      </div>

      <!-- Routes Grid/List -->
      <div v-else class="routes-grid">
        <div 
          v-for="(route, idx) in routes" 
          :key="idx" 
          class="route-card glass-card"
          :class="{ disabled: !route.enabled }"
        >
          <div class="route-top">
            <span class="provider-pill">{{ getProviderName(route.source) }}</span>
            <label class="toggle-switch">
              <input type="checkbox" :checked="route.enabled" @change="toggleRoute(idx)" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="route-path">
            <div class="point point-origin">
              <span class="point-label">Откуда</span>
              <span class="point-val">{{ route.originName || getCountryName(route.originCountry) }}</span>
            </div>
            <div class="route-arrow">➔</div>
            <div class="point point-dest">
              <span class="point-label">Куда</span>
              <span class="point-val">{{ route.destinationName || getCountryName(route.destinationCountry) }}</span>
            </div>
          </div>

          <div v-if="route.pickupDate || route.returnDate" class="route-dates">
            <Calendar :size="12" />
            <span>{{ route.pickupDate || '...' }} — {{ route.returnDate || '...' }}</span>
          </div>

          <div class="route-actions">
            <button class="action-btn" title="Редактировать" @click="openRouteModal(idx)">
              <Edit3 :size="14" />
            </button>
            <button class="action-btn delete-btn" title="Удалить" @click="deleteRoute(idx)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Providers Connection Health -->
    <div class="health-section glass-card">
      <div class="section-header" style="margin-bottom: 12px;">
        <div class="section-title">
          <span>{{ t('site_status') || 'Связь с сайтами' }}</span>
        </div>
        <button class="btn btn-secondary btn-sm" :disabled="isHealthLoading" @click="checkHealth">
          <RefreshCw :size="12" :class="{ spin: isHealthLoading }" />
          <span>{{ isHealthLoading ? 'Проверка...' : (t('refresh') || 'Обновить') }}</span>
        </button>
      </div>

      <div class="health-grid">
        <div class="health-item">
          <span class="health-name">🚐 Roadsurfer</span>
          <span class="health-status" :class="providersHealth?.roadsurfer?.ok ? 'ok' : 'pending'">
            {{ providersHealth?.roadsurfer ? (providersHealth.roadsurfer.ok ? 'Работает' : 'Ошибка') : 'Готов' }}
          </span>
        </div>
        <div class="health-item">
          <span class="health-name">🚗 Movacar</span>
          <span class="health-status" :class="providersHealth?.movacar?.ok ? 'ok' : 'pending'">
            {{ providersHealth?.movacar ? (providersHealth.movacar.ok ? 'Работает' : 'Ошибка') : 'Готов' }}
          </span>
        </div>
        <div class="health-item">
          <span class="health-name">⛺ Indie Campers</span>
          <span class="health-status" :class="providersHealth?.indiecampers?.ok ? 'ok' : 'pending'">
            {{ providersHealth?.indiecampers ? (providersHealth.indiecampers.ok ? 'Работает' : 'Ошибка') : 'Готов' }}
          </span>
        </div>
        <div class="health-item">
          <span class="health-name">🌐 Imoova</span>
          <span class="health-status" :class="providersHealth?.imoova?.ok ? 'ok' : 'pending'">
            {{ providersHealth?.imoova ? (providersHealth.imoova.ok ? 'Работает' : 'Ошибка') : 'Готов' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Sub banner */
.sub-banner {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.25) 0%, rgba(147, 51, 234, 0.25) 100%);
  border: 1px solid rgba(59, 130, 246, 0.35);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  cursor: pointer;
  padding: 18px 20px;
}

.banner-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #60a5fa;
  margin-bottom: 4px;
}

.banner-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 2px;
}

.banner-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.banner-btn {
  flex-shrink: 0;
}

.premium-active-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.25);
}

.active-badge {
  font-size: 11px;
  font-weight: 800;
  color: #fbbf24;
  margin-bottom: 2px;
}

.active-text {
  font-size: 13px;
  color: var(--text-main);
}

/* Status Card */
.status-card {
  padding: 16px 20px;
}

.status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.status-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 10px var(--success);
}

.status-title {
  font-size: 14px;
  font-weight: 700;
}

.status-details {
  display: flex;
  gap: 24px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 12px;
}

.status-item-label {
  font-size: 11px;
  color: var(--text-subtle);
  text-transform: uppercase;
  font-weight: 600;
}

.status-item-value {
  font-size: 14px;
  font-weight: 700;
  margin-top: 2px;
}

/* Routes */
.routes-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 640px) {
  .routes-grid {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  }
}

.route-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.route-card.disabled {
  opacity: 0.55;
}

.route-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.provider-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.route-path {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.point {
  flex: 1;
}

.point-label {
  display: block;
  font-size: 10px;
  color: var(--text-subtle);
  text-transform: uppercase;
  font-weight: 600;
}

.point-val {
  font-size: 14px;
  font-weight: 700;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.route-arrow {
  color: var(--accent-primary);
  font-size: 16px;
}

.route-dates {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.route-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 10px;
  margin-top: 4px;
}

.action-btn {
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 5px 8px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.16s ease;
}

.action-btn:hover {
  color: var(--text-main);
  background: var(--bg-hover);
}

.action-btn.delete-btn:hover {
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.3);
  background: var(--danger-bg);
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
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
  transform: translateX(16px);
}

/* Empty Card */
.empty-card {
  text-align: center;
  padding: 36px 20px;
}
.empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
}
.empty-title {
  font-size: 15px;
  font-weight: 700;
}
.empty-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Health Section */
.health-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (min-width: 640px) {
  .health-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.health-item {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.health-name {
  font-size: 12px;
  font-weight: 600;
}

.health-status {
  font-size: 11px;
  font-weight: 600;
}

.health-status.ok {
  color: var(--success);
}

.health-status.pending {
  color: var(--text-muted);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
