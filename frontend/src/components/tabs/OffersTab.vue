<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { api } from '../../api/rpc';
import { useI18n } from '../../composables/useI18n';
import { useAppStore } from '../../composables/useAppStore';
import type { Offer, OffersFilterPayload } from '../../api/types';
import { 
  Filter, 
  ExternalLink, 
  Calendar, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  Sparkles,
  CheckCircle2
} from 'lucide-vue-next';

const { t, getCountryName } = useI18n();
const { showToast } = useAppStore();

const offers = ref<Offer[]>([]);
const totalOffers = ref(0);
const currentPage = ref(1);
const totalPages = ref(1);
const isLoading = ref(false);
const isCheckingAvail = ref(false);

const filterSource = ref('');
const filterVehicleType = ref('');
const filterSortBy = ref('added_desc');
const filterMatched = ref(false);
const dateFrom = ref('');
const dateTo = ref('');

const providers = [
  { id: '', label: 'all_badge' },
  { id: 'roadsurfer', label: '🚐 Roadsurfer' },
  { id: 'movacar', label: '🚗 Movacar' },
  { id: 'indiecampers', label: '⛺ Indie Campers' },
  { id: 'imoova', label: '🌐 Imoova' },
];

async function loadOffers() {
  isLoading.value = true;
  try {
    const payload: OffersFilterPayload = {
      source: filterSource.value || undefined,
      vehicleType: filterVehicleType.value || undefined,
      sortBy: filterSortBy.value,
      isMatched: filterMatched.value || undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
      page: currentPage.value,
      limit: 15,
    };
    const res = await api.getOffers(payload);
    offers.value = res.offers || [];
    totalOffers.value = res.total || 0;
    currentPage.value = res.page || 1;
    totalPages.value = res.totalPages || 1;
  } catch (err) {
    offers.value = [];
  } finally {
    isLoading.value = false;
  }
}

async function checkAvailability() {
  isCheckingAvail.value = true;
  try {
    const removedCount = await api.checkOffersAvailability();
    showToast(`Очищено ${removedCount} истекших офферов`);
    loadOffers();
  } catch (err: any) {
    showToast(err.message || 'Ошибка проверки актуальности', true);
  } finally {
    isCheckingAvail.value = false;
  }
}

function calculateDays(pickup: string, dropoff: string): number {
  if (!pickup || !dropoff) return 1;
  const p = new Date(pickup);
  const d = new Date(dropoff);
  const diffTime = Math.abs(d.getTime() - p.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

function setDatePreset(type: '7days' | '14days' | 'month') {
  const now = new Date();
  if (type === '7days') {
    dateFrom.value = now.toISOString().split('T')[0];
    const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    dateTo.value = next7.toISOString().split('T')[0];
  } else if (type === '14days') {
    dateFrom.value = now.toISOString().split('T')[0];
    const next14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    dateTo.value = next14.toISOString().split('T')[0];
  } else if (type === 'month') {
    dateFrom.value = now.toISOString().split('T')[0];
    const next30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    dateTo.value = next30.toISOString().split('T')[0];
  }
  currentPage.value = 1;
  loadOffers();
}

function clearDates() {
  dateFrom.value = '';
  dateTo.value = '';
  currentPage.value = 1;
  loadOffers();
}

watch([filterSource, filterVehicleType, filterSortBy, filterMatched], () => {
  currentPage.value = 1;
  loadOffers();
});

onMounted(() => {
  loadOffers();
});
</script>

<template>
  <div class="offers-tab">
    <!-- Filter Controls Bar -->
    <div class="glass-card filter-card">
      <div class="filter-top">
        <div class="filter-title">
          <Filter :size="15" />
          <span>{{ t('tab_offers') }}</span>
          <span class="badge badge-neutral">{{ totalOffers }}</span>
        </div>

        <div class="sort-selector">
          <select v-model="filterSortBy" class="select select-sm">
            <option value="added_desc">{{ t('offers_sort_added') }}</option>
            <option value="trip_date">{{ t('offers_sort_trip') }}</option>
          </select>
        </div>
      </div>

      <!-- Quick Chips: Providers -->
      <div class="chips-scroll">
        <button
          v-for="p in providers"
          :key="p.id"
          class="chip"
          :class="{ active: filterSource === p.id }"
          @click="filterSource = p.id"
        >
          {{ p.id === '' ? t('all_badge') : p.label }}
        </button>

        <button
          class="chip chip-matched"
          :class="{ active: filterMatched }"
          @click="filterMatched = !filterMatched"
        >
          <Sparkles :size="12" />
          <span>{{ t('filter_only_matched') }}</span>
        </button>
      </div>

      <!-- Date Presets & Check Avail Button -->
      <div class="filter-actions-row">
        <div class="date-presets">
          <button class="preset-btn" @click="setDatePreset('7days')">{{ t('date_preset_7d') }}</button>
          <button class="preset-btn" @click="setDatePreset('14days')">{{ t('date_preset_14d') }}</button>
          <button class="preset-btn" @click="setDatePreset('month')">{{ t('date_preset_month') }}</button>
          <button v-if="dateFrom || dateTo" class="preset-btn clear-btn" @click="clearDates">
            ✕ {{ t('btn_clear') }}
          </button>
        </div>

        <button 
          class="btn btn-secondary btn-sm check-avail-btn" 
          :disabled="isCheckingAvail" 
          @click="checkAvailability"
        >
          <RefreshCw :size="13" :class="{ spin: isCheckingAvail }" />
          <span>{{ t('btn_check_avail') }}</span>
        </button>
      </div>
    </div>

    <!-- Offers List / Cards -->
    <div v-if="isLoading" class="loading-state">
      <RefreshCw class="spin" :size="24" />
      <span>{{ t('loading') }}</span>
    </div>

    <div v-else-if="offers.length === 0" class="glass-card empty-state">
      <div class="empty-icon">🎫</div>
      <div class="empty-title">{{ t('offers_empty_title') }}</div>
      <div class="empty-sub">{{ t('offers_empty_desc') }}</div>
    </div>

    <div v-else class="offers-grid">
      <div v-for="offer in offers" :key="offer.offerId" class="offer-card glass-card">
        <div class="offer-header">
          <span class="provider-tag">{{ offer.operator || offer.source }}</span>
          <span class="price-badge">{{ offer.price }} {{ offer.currency || '€' }}</span>
        </div>

        <div class="route-display">
          <div class="route-node">
            <span class="node-city">{{ offer.origin }}</span>
            <span class="node-country">{{ getCountryName(offer.originCountry) }}</span>
          </div>
          <div class="route-arrow">➔</div>
          <div class="route-node">
            <span class="node-city">{{ offer.destination }}</span>
            <span class="node-country">{{ getCountryName(offer.destinationCountry) }}</span>
          </div>
        </div>

        <div class="offer-meta">
          <div class="meta-item">
            <Calendar :size="13" />
            <span>{{ offer.pickupDate }} — {{ offer.returnDate }}</span>
            <span class="days-badge">({{ t('offers_days_trip', { days: calculateDays(offer.pickupDate, offer.returnDate) }) }})</span>
          </div>
          <div v-if="offer.vehicle" class="vehicle-title">
            🚐 {{ offer.vehicle }}
          </div>
        </div>

        <a
          :href="offer.bookingUrl"
          target="_blank"
          rel="noopener"
          class="btn btn-primary book-btn"
        >
          <span>{{ t('btn_book') }}</span>
          <ExternalLink :size="14" />
        </a>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination-bar">
      <button
        class="btn btn-secondary btn-sm"
        :disabled="currentPage <= 1 || isLoading"
        @click="currentPage--; loadOffers()"
      >
        <ChevronLeft :size="14" />
        <span>{{ t('page_prev') }}</span>
      </button>

      <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>

      <button
        class="btn btn-secondary btn-sm"
        :disabled="currentPage >= totalPages || isLoading"
        @click="currentPage++; loadOffers()"
      >
        <span>{{ t('page_next') }}</span>
        <ChevronRight :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.offers-tab {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.filter-card {
  padding: 16px;
}

.filter-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.filter-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-subtle);
}

.select-sm {
  padding: 6px 10px;
  font-size: 12px;
  width: auto;
}

.chips-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 6px;
  scrollbar-width: none;
}

.chips-scroll::-webkit-scrollbar {
  display: none;
}

.chip {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.16s ease;
}

.chip:hover {
  background: var(--bg-surface-elevated);
  color: var(--text-main);
}

.chip.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: #ffffff;
}

.chip-matched.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-color: #10b981;
}

.filter-actions-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
}

@media (min-width: 640px) {
  .filter-actions-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.date-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.16s ease;
}

.preset-btn:hover {
  background: var(--bg-surface-elevated);
  color: var(--text-main);
}

.preset-btn.clear-btn {
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.3);
}

.check-avail-btn {
  align-self: flex-start;
}

/* Offers Grid */
.offers-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 640px) {
  .offers-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.offer-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.price-badge {
  font-size: 15px;
  font-weight: 800;
  color: #10b981;
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
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.node-country {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}

.route-arrow {
  color: var(--text-subtle);
  font-size: 13px;
}

.offer-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.days-badge {
  color: var(--accent-primary);
  font-weight: 600;
}

.vehicle-title {
  font-size: 11px;
  color: var(--text-main);
  font-weight: 500;
}

.book-btn {
  width: 100%;
  padding: 10px;
  justify-content: center;
}

.loading-state, .empty-state {
  padding: 48px 20px;
  text-align: center;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 10px;
}

.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}

.empty-sub {
  font-size: 13px;
  margin-top: 4px;
}

/* Pagination */
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px 0;
}

.page-info {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}
</style>
