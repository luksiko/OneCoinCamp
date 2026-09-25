<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { api } from '../../api/rpc';
import { useI18n } from '../../composables/useI18n';
import type { Offer, OffersFilterPayload } from '../../api/types';
import { 
  Filter, 
  ExternalLink, 
  Calendar, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  Check, 
  Sparkles 
} from 'lucide-vue-next';

const { t, getCountryName, pluralizeDays } = useI18n();

const offers = ref<Offer[]>([]);
const totalOffers = ref(0);
const currentPage = ref(1);
const totalPages = ref(1);
const isLoading = ref(false);

const filterSource = ref('');
const filterVehicleType = ref('');
const filterSortBy = ref('added_desc');
const filterMatched = ref(false);
const dateFrom = ref('');
const dateTo = ref('');

const providers = [
  { id: '', label: 'Все' },
  { id: 'roadsurfer', label: '🚐 Roadsurfer' },
  { id: 'movacar', label: '🚗 Movacar' },
  { id: 'indiecampers', label: '⛺ Indie' },
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

function calculateDays(pickup: string, dropoff: string): number {
  if (!pickup || !dropoff) return 1;
  const p = new Date(pickup);
  const d = new Date(dropoff);
  const diffTime = Math.abs(d.getTime() - p.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

function setDatePreset(type: 'weekend' | '7days' | '14days') {
  const now = new Date();
  if (type === '7days') {
    dateFrom.value = now.toISOString().split('T')[0];
    const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    dateTo.value = next7.toISOString().split('T')[0];
  } else if (type === '14days') {
    dateFrom.value = now.toISOString().split('T')[0];
    const next14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    dateTo.value = next14.toISOString().split('T')[0];
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
          <span>{{ t('offers_filters') || 'Фильтры' }}</span>
          <span class="badge badge-neutral">{{ totalOffers }}</span>
        </div>

        <div class="sort-selector">
          <select v-model="filterSortBy" class="select select-sm">
            <option value="added_desc">🕒 Сначала новые</option>
            <option value="pickup_asc">📅 Сначала ближайшие даты</option>
            <option value="price_asc">💶 Сначала дешевле</option>
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
          {{ p.label }}
        </button>

        <button
          class="chip chip-matched"
          :class="{ active: filterMatched }"
          @click="filterMatched = !filterMatched"
        >
          <Sparkles :size="12" />
          <span>{{ t('my_routes_only') || 'Мои маршруты' }}</span>
        </button>
      </div>

      <!-- Date presets -->
      <div class="date-presets">
        <button class="preset-btn" @click="setDatePreset('7days')">7 дней</button>
        <button class="preset-btn" @click="setDatePreset('14days')">14 дней</button>
        <button v-if="dateFrom || dateTo" class="preset-btn clear-btn" @click="clearDates">
          ✕ Сброс дат
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
      <div class="empty-title">{{ t('offers_empty') || 'Предложений не найдено' }}</div>
      <div class="empty-sub">Попробуйте изменить выбранные фильтры или провайдеров</div>
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
            <span class="days-badge">({{ calculateDays(offer.pickupDate, offer.returnDate) }} дн.)</span>
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
          <span>{{ t('btn_book') || 'Забронировать' }}</span>
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
        <span>Назад</span>
      </button>

      <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>

      <button
        class="btn btn-secondary btn-sm"
        :disabled="currentPage >= totalPages || isLoading"
        @click="currentPage++; loadOffers()"
      >
        <span>Вперёд</span>
        <ChevronRight :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.offers-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  color: var(--text-muted);
}

.select-sm {
  padding: 6px 10px;
  font-size: 12px;
}

.chips-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
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
  background: linear-gradient(135deg, #f59e0b, #ea580c);
  border-color: #f59e0b;
}

.date-presets {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.preset-btn {
  background: transparent;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
}

.preset-btn:hover {
  color: var(--text-main);
  border-color: rgba(255, 255, 255, 0.2);
}

.clear-btn {
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.3);
}

/* Offers Grid */
.offers-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 640px) {
  .offers-grid {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  }
}

.offer-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
}

.offer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.provider-tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-surface-elevated);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
}

.price-badge {
  font-size: 14px;
  font-weight: 800;
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.route-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.route-node {
  flex: 1;
}

.node-city {
  font-size: 15px;
  font-weight: 700;
  display: block;
}

.node-country {
  font-size: 11px;
  color: var(--text-muted);
  display: block;
}

.route-arrow {
  color: var(--accent-primary);
  font-size: 16px;
}

.offer-meta {
  border-top: 1px solid var(--border-subtle);
  padding-top: 10px;
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.days-badge {
  color: var(--text-subtle);
  font-size: 11px;
}

.vehicle-title {
  color: var(--text-main);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-btn {
  width: 100%;
  padding: 10px;
  font-size: 13px;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px 0;
}

.page-info {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

.loading-state, .empty-state {
  text-align: center;
  padding: 48px 20px;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.empty-title {
  font-size: 16px;
  font-weight: 700;
}

.empty-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

.spin {
  animation: spin 1s linear infinite;
  color: var(--accent-primary);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
