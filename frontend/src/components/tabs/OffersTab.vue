<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { api } from '../../api/rpc';
import { useI18n } from '../../composables/useI18n';
import { useAppStore } from '../../composables/useAppStore';
import { highlightedOfferId } from '../../composables/useRouter';
import type { Offer, OffersFilterPayload } from '../../api/types';
import { formatDateRange } from '../../utils/date';
import { 
  Filter, 
  ExternalLink, 
  Calendar, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  Sparkles,
  CheckCircle2,
  Clock,
  CalendarPlus
} from 'lucide-vue-next';

import { useSearchStore } from '../../composables/useSearchStore';

const { t, getCountryName, currentLang, pluralizeDays } = useI18n();
const { showToast } = useAppStore();
const { globalSearchFilters, resetSearch } = useSearchStore();

const offers = ref<Offer[]>([]);
const totalOffers = ref(0);
const currentPage = ref(1);
const totalPages = ref(1);
const isLoading = ref(false);

const zoomedImage = ref<string | null>(null);
const zoomedTitle = ref<string>('');

function openImageModal(imageUrl: string, title?: string) {
  zoomedImage.value = imageUrl;
  zoomedTitle.value = title || '';
}
const isCheckingAvail = ref(false);

const filterSource = ref('');
const filterVehicleType = ref(globalSearchFilters.value.vehicleType || '');
const filterSortBy = ref('added_desc');
const filterMatched = ref(true); // Default to true as requested
const dateFrom = ref(globalSearchFilters.value.dateFrom || '');
const dateTo = ref(globalSearchFilters.value.dateTo || '');

const filterOriginCountry = ref(globalSearchFilters.value.originCountry || '');
const filterDestinationCountry = ref(globalSearchFilters.value.destinationCountry || '');

// Clean up global search state after adopting it so it doesn't stick forever
onMounted(() => {
  resetSearch();
});

const providers = [
  { id: '', label: 'all_badge' },
  { id: 'roadsurfer', label: '🚐 Roadsurfer' },
  { id: 'movacar', label: '🚗 Movacar' },
  { id: 'indiecampers', label: '⛺ Indie Campers' },
  { id: 'imoova', label: '🌐 Imoova' },
];

// Desktop detection for table/card switch
const isDesktop = ref(window.matchMedia('(min-width: 768px)').matches);
onMounted(() => {
  const mq = window.matchMedia('(min-width: 768px)');
  const handler = (e: MediaQueryListEvent) => { isDesktop.value = e.matches; };
  mq.addEventListener('change', handler);
});

// Desktop table column sorting (client-side secondary sort)
const sortCol = ref<string>('');
const sortAsc = ref(true);

function toggleSort(col: string) {
  if (sortCol.value === col) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortCol.value = col;
    sortAsc.value = true;
  }
  currentPage.value = 1;
  loadOffers();
}

const sortedOffers = computed(() => {
  return offers.value; // Server now handles all sorting
});

async function loadOffers() {
  isLoading.value = true;
  try {
    const payload: OffersFilterPayload = {
      source: filterSource.value || undefined,
      vehicleType: filterVehicleType.value || undefined,
      sortBy: filterSortBy.value,
      sortCol: sortCol.value || undefined,
      sortAsc: sortAsc.value,
      isMatched: filterMatched.value || undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
      originCountry: filterOriginCountry.value || undefined,
      destinationCountry: filterDestinationCountry.value || undefined,
      page: currentPage.value,
      limit: 15,
    };
    const res = await api.getOffers(payload);
    offers.value = res.offers || [];
    totalOffers.value = res.total || 0;
    currentPage.value = res.page || 1;
    totalPages.value = res.totalPages || 1;
    // Scroll to deep-linked offer if present
    if (highlightedOfferId.value) {
      await nextTick();
      scrollToHighlighted();
    }
  } catch (err) {
    offers.value = [];
  } finally {
    isLoading.value = false;
  }
}

function scrollToHighlighted() {
  const id = highlightedOfferId.value;
  if (!id) return;
  const el = document.querySelector(`[data-offer-id="${id}"]`) as HTMLElement | null;
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('offer-highlighted');
    setTimeout(() => {
      el.classList.remove('offer-highlighted');
      highlightedOfferId.value = null;
    }, 3000);
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
  const t1 = new Date(pickup).getTime();
  const t2 = new Date(dropoff).getTime();
  return Math.max(1, Math.round((t2 - t1) / (1000 * 3600 * 24)));
}

function getCalendarUrl(offer: Offer): string {
  const text = encodeURIComponent(`Camper Relocation: ${offer.origin} → ${offer.destination}`);
  const details = encodeURIComponent(
    `Provider: ${offer.operator || offer.source}\n` +
    `Vehicle: ${offer.vehicle || 'Any'}\n` +
    `Price: ${offer.price} €\n\n` +
    `Book here: ${offer.bookingUrl}`
  );
  
  if (!offer.pickupDate || !offer.returnDate) return offer.bookingUrl;
  
  const format = (d: string) => d.replace(/-/g, '');
  const start = format(offer.pickupDate);
  
  // Google Calendar all-day events require the end date to be exclusive (+1 day)
  const endDate = new Date(offer.returnDate);
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().split('T')[0].replace(/-/g, '');
  
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&details=${details}&dates=${start}/${end}`;
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

watch([filterSource, filterVehicleType, filterMatched, filterOriginCountry, filterDestinationCountry], () => {
  currentPage.value = 1;
  loadOffers();
});

watch(filterSortBy, () => {
  sortCol.value = ''; // Reset table header sorting when dropdown changes
  currentPage.value = 1;
  loadOffers();
});

onMounted(() => {
  loadOffers();
});

// Per-provider staleness thresholds (minutes)
const STALENESS_THRESHOLDS: Record<string, { hurry: number; gone: number }> = {
  roadsurfer:   { hurry: 5,  gone: 15 },
  movacar:      { hurry: 10, gone: 30 },
  indiecampers: { hurry: 15, gone: 45 },
  imoova:       { hurry: 30, gone: 60 },
};

type Staleness = 'live' | 'hurry' | 'gone';

function getOfferStaleness(offer: Offer): Staleness {
  const ts = offer.timestamp || offer.lastSeenAt;
  if (!ts) return 'live'; // no timestamp = freshly inserted, assume live
  const ageMinutes = (Date.now() - new Date(ts).getTime()) / 60000;
  const key = (offer.source || '').toLowerCase();
  const thresholds = STALENESS_THRESHOLDS[key] || { hurry: 15, gone: 45 };
  if (ageMinutes >= thresholds.gone) return 'gone';
  if (ageMinutes >= thresholds.hurry) return 'hurry';
  return 'live';
}

function formatAddedAt(ts?: string): string {
  if (!ts) return t('added_at', { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  const date = new Date(ts);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 24 * 60) {
    return t('added_at', { time: timeStr });
  }
  return date.toLocaleDateString() + ' ' + timeStr;
}

function stalenessLabel(staleness: Staleness): string {
  if (staleness === 'gone') return '🔴 ' + (t('staleness_gone') || 'Likely Gone');
  if (staleness === 'hurry') return '🟡 ' + (t('staleness_hurry') || 'Book Fast');
  return '🟢 ' + (t('staleness_live') || 'LIVE');
}
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
            <option value="price_asc">{{ t('offers_sort_price') }}</option>
          </select>
        </div>
      </div>

      <!-- Quick Chips: Mode & Providers -->
      <div class="chips-scroll">
        <button
          class="chip chip-matched"
          :class="{ active: filterMatched }"
          @click="filterMatched = true"
        >
          <Sparkles :size="12" />
          <span>{{ t('filter_only_matched') }}</span>
        </button>

        <button
          class="chip"
          :class="{ active: !filterMatched && filterSource === '' }"
          @click="filterMatched = false; filterSource = ''"
        >
          {{ t('all_badge') }}
        </button>

        <div class="divider"></div>

        <button
          v-for="p in providers.filter(p => p.id !== '')"
          :key="p.id"
          class="chip"
          :class="{ active: filterSource === p.id }"
          @click="filterSource = filterSource === p.id ? '' : p.id"
        >
          {{ p.label }}
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

    <!-- ── DESKTOP TABLE VIEW (≥768px) ── -->
    <div v-else-if="isDesktop" class="glass-card offers-table-wrap">
      <table class="offers-table">
        <thead>
          <tr>
            <th class="th-sort" @click="toggleSort('staleness')">
              Status {{ sortCol === 'staleness' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="th-sort" @click="toggleSort('route')">
              Route {{ sortCol === 'route' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="th-sort" @click="toggleSort('source')">
              Provider {{ sortCol === 'source' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="th-sort" @click="toggleSort('pickup')">
              Pickup {{ sortCol === 'pickup' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="th-sort" @click="toggleSort('days')">
              Days {{ sortCol === 'days' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="th-sort" @click="toggleSort('price')">
              Price {{ sortCol === 'price' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th>Vehicle</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="offer in sortedOffers"
            :key="offer.fingerprint || offer.offerId"
            :data-offer-id="offer.offerId"
            :class="`tr-staleness-${getOfferStaleness(offer)}`"
          >
            <td>
              <div class="status-col">
                <span class="staleness-badge" :class="`staleness-badge--${getOfferStaleness(offer)}`">
                  {{ stalenessLabel(getOfferStaleness(offer)) }}
                </span>
                <span class="time-ago">{{ formatAddedAt(offer.timestamp || offer.lastSeenAt) }}</span>
              </div>
            </td>
            <td class="td-route">
              <span class="td-city">{{ offer.origin }}</span>
              <span class="td-arrow">➔</span>
              <span class="td-city">{{ offer.destination }}</span>
            </td>
            <td>
              <span class="provider-tag">{{ offer.operator || offer.source }}</span>
            </td>
            <td class="td-muted">{{ formatDateRange(offer.pickupDate, offer.returnDate, currentLang) }}</td>
            <td class="td-muted">{{ calculateDays(offer.pickupDate, offer.returnDate) }}d</td>
            <td class="td-price">{{ offer.price }} €</td>
            <td class="td-muted td-vehicle">
              <div class="vehicle-cell">
                <img 
                  v-if="offer.imageUrl" 
                  :src="offer.imageUrl" 
                  class="vehicle-thumb" 
                  :alt="offer.vehicle || 'Vehicle'" 
                  @error="offer.imageUrl = ''" 
                  @click="openImageModal(offer.imageUrl, offer.vehicle)"
                  style="cursor: pointer;"
                />
                <span v-else>🚐</span>
                <span class="vehicle-name">{{ offer.vehicle || '—' }}</span>
              </div>
            </td>
            <td>
              <div class="table-actions">
                <a
                  :href="offer.bookingUrl"
                  target="_blank"
                  rel="noopener"
                  class="btn btn-primary btn-xs-table"
                  :class="{ 
                    'btn-hurry': getOfferStaleness(offer) === 'hurry',
                    'btn-gone': getOfferStaleness(offer) === 'gone'
                  }"
                >
                  {{ t('btn_book') }} ↗
                </a>
                <a :href="getCalendarUrl(offer)" target="_blank" class="btn btn-secondary btn-xs-table cal-btn-table" title="Add to Google Calendar">
                  <CalendarPlus :size="14" />
                </a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── MOBILE CARD GRID ── -->
    <div v-else class="offers-grid">
      <div
        v-for="offer in offers"
        :key="offer.fingerprint || offer.offerId"
        class="offer-card glass-card"
        :class="`staleness-${getOfferStaleness(offer)}`"
        :data-offer-id="offer.offerId"
      >
        <div class="offer-header">
          <span class="provider-tag">{{ offer.operator || offer.source }}</span>
          <div class="header-right">
            <span class="staleness-badge" :class="`staleness-badge--${getOfferStaleness(offer)}`">
              {{ stalenessLabel(getOfferStaleness(offer)) }}
            </span>
            <span class="price-badge">{{ offer.price }} €</span>
          </div>
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
          <div class="meta-left">
            <div class="meta-item">
              <Clock :size="13" />
              <span>{{ formatAddedAt(offer.timestamp || offer.lastSeenAt) }}</span>
            </div>
            <div class="meta-item">
              <Calendar :size="13" />
              <span>{{ formatDateRange(offer.pickupDate, offer.returnDate, currentLang) }} · {{ calculateDays(offer.pickupDate, offer.returnDate) }} {{ pluralizeDays(calculateDays(offer.pickupDate, offer.returnDate)) }}</span>
            </div>
            <div class="meta-item vehicle-info">
              <span>🚐</span>
              <span class="vehicle-name">{{ offer.vehicle || '—' }}</span>
            </div>
          </div>
          <div class="meta-right">
            <img 
              v-if="offer.imageUrl" 
              :src="offer.imageUrl" 
              class="vehicle-image-large" 
              :alt="offer.vehicle || 'Vehicle'" 
              @error="offer.imageUrl = ''"
              @click="openImageModal(offer.imageUrl, offer.vehicle)"
            />
          </div>
        </div>

        <div class="mobile-offer-actions">
          <a
            :href="offer.bookingUrl"
            target="_blank"
            rel="noopener"
            class="btn btn-primary book-btn"
            :class="{ 
              'btn-hurry': getOfferStaleness(offer) === 'hurry',
              'btn-gone': getOfferStaleness(offer) === 'gone'
            }"
          >
            <span>{{ t('btn_book') }}</span>
            <ExternalLink :size="14" />
          </a>
          
          <a :href="getCalendarUrl(offer)" target="_blank" class="btn btn-secondary cal-btn-mobile" title="Add to Google Calendar">
            <CalendarPlus :size="16" />
          </a>
        </div>
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

    <!-- Image Modal -->
    <div v-if="zoomedImage" class="image-modal-overlay" @click="zoomedImage = null">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" @click="zoomedImage = null">✕</button>
        <img :src="zoomedImage" class="image-modal-img" />
        <div v-if="zoomedTitle" class="image-modal-title">{{ zoomedTitle }}</div>
      </div>
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

.divider {
  width: 1px;
  height: 16px;
  background: var(--border-subtle);
  margin: 0 4px;
  align-self: center;
  flex-shrink: 0;
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

/* ── Desktop Table ─────────────────────────────────────── */
.offers-table-wrap {
  padding: 0;
  overflow: hidden;
}

.offers-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.offers-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-surface);
}

.offers-table th {
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-subtle);
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.th-sort {
  cursor: pointer;
  user-select: none;
}

.th-sort:hover {
  color: var(--text-main);
}

.offers-table td {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  vertical-align: middle;
}

.offers-table tbody tr:hover {
  background: var(--bg-surface-elevated, rgba(255,255,255,0.03));
}

/* Row staleness tints */
.tr-staleness-gone {
  opacity: 0.6;
}

.tr-staleness-hurry td:first-child {
  border-left: 2px solid rgba(245, 158, 11, 0.5);
}

.td-route {
  font-weight: 600;
  white-space: nowrap;
}

.td-city {
  color: var(--text-main);
}

.td-arrow {
  color: var(--text-subtle);
  margin: 0 6px;
  font-size: 11px;
}

.td-muted {
  color: var(--text-muted);
  font-size: 12px;
}

.td-price {
  font-weight: 800;
  color: #10b981;
  white-space: nowrap;
}

.td-vehicle {
  max-width: 140px;
}
.vehicle-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vehicle-thumb {
  width: 40px;
  height: 28px;
  object-fit: cover;
  border-radius: 4px;
}
.vehicle-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-xs-table {
  padding: 5px 12px;
  font-size: 12px;
  white-space: nowrap;
}

.gone-tag {
  font-size: 11px;
  color: var(--danger, #ef4444);
  font-weight: 600;
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

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.time-ago {
  font-size: 11px;
  color: var(--text-muted);
}

/* Staleness traffic-light badges */
.staleness-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 999px;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.staleness-badge--live {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.staleness-badge--hurry {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.staleness-badge--gone {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* Card tint by staleness */
.offer-card.staleness-gone {
  opacity: 0.65;
  border-color: rgba(239, 68, 68, 0.25) !important;
}

.offer-card.staleness-hurry {
  border-color: rgba(245, 158, 11, 0.3) !important;
}

/* Book button variant for hurry state */
.btn-hurry {
  background: linear-gradient(135deg, #f59e0b, #d97706) !important;
  border-color: transparent !important;
}

.btn-gone {
  background: var(--bg-surface-elevated) !important;
  color: var(--text-muted) !important;
  border-color: var(--border-subtle) !important;
}

/* Deep-link highlight: pulsing glow for 3s on the targeted card */
@keyframes offer-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(46, 166, 255, 0.4); }
  50%       { box-shadow: 0 0 0 6px rgba(46, 166, 255, 0.15); }
}

.offer-highlighted {
  border-color: var(--accent-primary, #2ea6ff) !important;
  animation: offer-pulse 1s ease-in-out 3;
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
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
}

.meta-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.meta-right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.vehicle-image-large {
  width: 90px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
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

.vehicle-info {
  font-size: 11px;
  color: var(--text-main);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
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

.table-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cal-btn-table {
  padding: 5px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mobile-offer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.mobile-offer-actions .btn {
  flex: 1;
}
.mobile-offer-actions .cal-btn-mobile {
  flex: 0 0 auto;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Image Modal */
.image-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.image-modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  background: var(--bg-main);
  border-radius: var(--radius-lg);
  padding: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.image-modal-close {
  position: absolute;
  top: -40px;
  right: 0;
  background: transparent;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  padding: 8px;
  line-height: 1;
}

.image-modal-img {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

.image-modal-title {
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  word-wrap: break-word;
}
</style>
