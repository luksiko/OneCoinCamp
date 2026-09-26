<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { useI18n } from '../../composables/useI18n';
import { formatDateRange } from '../../utils/date';
import { 
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
              <span class="node-city">{{ route.originName || (route.originCountry === 'ALL' ? (t('all_cities') || 'Все города') : getCountryName(route.originCountry)) }}</span>
              <span class="node-country">{{ getCountryName(route.originCountry) }}</span>
            </div>
            <div class="route-arrow">➔</div>
            <div class="route-node">
              <span class="node-city">{{ route.destinationName || (route.destinationCountry === 'ALL' ? (t('all_cities') || 'Все города') : (route.destinationCountry ? getCountryName(route.destinationCountry) : 'Anywhere')) }}</span>
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
