<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useRouter } from '../../composables/useRouter';
import { useAppStore } from '../../composables/useAppStore';
import { useSearchStore } from '../../composables/useSearchStore';
import { api } from '../../api/rpc';
import type { Offer } from '../../api/types';
import { Compass, Calendar, MapPin, Search } from 'lucide-vue-next';

const { t } = useI18n();
const { switchTab } = useRouter();
const { appState } = useAppStore();
const { applySearch } = useSearchStore();

const originCountry = ref('');
const destinationCountry = ref('');
const dateFrom = ref('');
const vehicleType = ref('');

const bestOffers = ref<Offer[]>([]);
const totalOffers = ref(0);
const isLoadingOffers = ref(false);

const countries = computed(() => {
  return appState.value?.countries || [];
});

async function fetchBestOffers() {
  isLoadingOffers.value = true;
  try {
    const res = await api.getOffers({ limit: 4, sortBy: 'added_desc' });
    bestOffers.value = res.offers || [];
    totalOffers.value = res.total || 0;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingOffers.value = false;
  }
}

onMounted(() => {
  fetchBestOffers();
});

function handleSearch() {
  applySearch({
    originCountry: originCountry.value === 'ALL' ? '' : originCountry.value,
    destinationCountry: destinationCountry.value === 'ALL' ? '' : destinationCountry.value,
    dateFrom: dateFrom.value,
    vehicleType: vehicleType.value,
  });
  switchTab('offers');
}

function getProviderName(src: string) {
  const map: Record<string, string> = {
    roadsurfer: 'Roadsurfer',
    movacar: 'Movacar',
    indiecampers: 'Indie Campers',
    imoova: 'Imoova',
  };
  return map[src] || src;
}
</script>

<template>
  <div class="main-search-tab">
    <div class="hero-section">
      <h1 class="hero-title">
        <span class="hero-campers-text">{{ t('hero_campers') }}</span>
        <br>
        <span class="hero-price-text">{{ t('hero_price') }}</span>
      </h1>
    </div>

    <div class="search-card glass-card">
      <div class="search-row">
        <div class="form-group">
          <label><MapPin :size="14" /> Откуда</label>
          <select v-model="originCountry" class="select select-lg">
            <option value="">Любая страна</option>
            <option v-for="[code, name] in countries" :key="code" :value="code">{{ name }}</option>
          </select>
        </div>

        <div class="form-group">
          <label><MapPin :size="14" /> Куда</label>
          <select v-model="destinationCountry" class="select select-lg">
            <option value="">Любая страна</option>
            <option v-for="[code, name] in countries" :key="code" :value="code">{{ name }}</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label><Calendar :size="14" /> Когда</label>
        <input type="date" v-model="dateFrom" class="select select-lg" placeholder="Любые даты" />
      </div>

      <div class="form-group">
        <label><Compass :size="14" /> Тип транспорта</label>
        <div class="segmented-control">
          <button 
            class="segment" 
            :class="{ active: vehicleType === '' }" 
            @click="vehicleType = ''"
          >Все</button>
          <button 
            class="segment" 
            :class="{ active: vehicleType === 'camper' }" 
            @click="vehicleType = 'camper'"
          >🚐 Кемперы</button>
          <button 
            class="segment" 
            :class="{ active: vehicleType === 'car' }" 
            @click="vehicleType = 'car'"
          >🚗 Авто</button>
        </div>
      </div>

      <button class="btn btn-primary btn-lg search-btn" @click="handleSearch">
        <Search :size="16" />
        <span>Показать предложения <template v-if="totalOffers">({{ totalOffers }})</template></span>
      </button>
    </div>

    <div class="best-offers-section" v-if="bestOffers.length > 0">
      <h2 class="section-title">Лучшие предложения сейчас</h2>
      <div class="offers-grid">
        <div v-for="offer in bestOffers" :key="offer.offerId" class="offer-card glass-card">
          <div class="offer-header">
            <span class="provider-tag">{{ getProviderName(offer.source) }}</span>
            <span class="price-badge">{{ offer.price }} €</span>
          </div>
          <div class="route-display">
            <div class="route-node">
              <span class="node-city">{{ offer.origin }}</span>
            </div>
            <div class="route-arrow">→</div>
            <div class="route-node">
              <span class="node-city">{{ offer.destination }}</span>
            </div>
          </div>
          <div class="offer-meta">
            <span class="meta-item"><Calendar :size="12" /> {{ offer.pickupDate }}</span>
            <span class="meta-item vehicle-title" v-if="offer.vehicle">{{ offer.vehicle }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="providers-info-section">
      <h2 class="section-title">Особенности провайдеров</h2>
      <div class="providers-grid">
        <div class="provider-info-card glass-card">
          <div class="provider-info-header">
            <span class="provider-tag">Roadsurfer (Rally)</span>
          </div>
          <ul class="provider-features">
            <li>Даёт машину на срок <b>до 7 дней</b>. Цены варьируются от €1 до €129+ за поездку.</li>
            <li>Включён лимит пробега (маршрут + 25%). Доп. пробег оплачивается отдельно.</li>
            <li>Продлить срок аренды можно за доплату.</li>
          </ul>
        </div>
        
        <div class="provider-info-card glass-card">
          <div class="provider-info-header">
            <span class="provider-tag">Movacar</span>
          </div>
          <ul class="provider-features">
            <li>Обычно перегоны стоят <b>€1</b>.</li>
            <li>Можно докупить <b>дополнительные дни</b> (до 7 дней) и пакеты километров.</li>
            <li>Удерживается залог (обычно ~€100), который полностью возвращается.</li>
          </ul>
        </div>

        <div class="provider-info-card glass-card">
          <div class="provider-info-header">
            <span class="provider-tag">Indie Campers</span>
          </div>
          <ul class="provider-features">
            <li>Фиксированные даты и локации за €1.</li>
            <li>Доп. дни можно запросить, но они будут стоить по <b>полному тарифу</b> аренды, а не €1.</li>
            <li>Запрашивать изменения нужно заранее (> 48 ч).</li>
          </ul>
        </div>

        <div class="provider-info-card glass-card">
          <div class="provider-info-header">
            <span class="provider-tag">Imoova</span>
          </div>
          <ul class="provider-features">
            <li>Доп. дни запрашиваются при бронировании по обычному тарифу.</li>
            <li>Строгие штрафы за опоздание: нужно сдать авто строго до закрытия депо.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-search-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 24px;
}

.hero-section {
  text-align: left;
  padding: 100px 20px 48px;
  margin: -80px -16px 0 -16px;
  background-image: 
    linear-gradient(to bottom, rgba(11, 15, 23, 0) 70%, rgba(11, 15, 23, 1) 100%),
    linear-gradient(to right, rgba(11, 15, 23, 0.85) 0%, rgba(11, 15, 23, 0.3) 50%, rgba(11, 15, 23, 0) 80%),
    url('/hero-bg.jpg');
  background-size: cover;
  background-position: right center;
  position: relative;
}

@media (min-width: 768px) {
  .hero-section {
    margin: -100px -24px 0 -24px;
    padding: 120px 40px 64px;
    border-radius: 0 0 24px 24px;
  }
}

.hero-title {
  color: #fff;
  line-height: 1.15;
  margin-bottom: 8px;
}

.hero-campers-text {
  font-size: 18px;
  font-weight: 600;
  opacity: 0.95;
  display: inline-block;
  margin-bottom: 4px;
}

.hero-price-text {
  font-size: 38px;
  font-weight: 800;
}

.search-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-subtle);
  display: flex;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.select-lg {
  padding: 12px 14px;
  font-size: 15px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-main);
  outline: none;
  width: 100%;
}

.segmented-control {
  display: flex;
  background: var(--bg-surface-elevated);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}

.segment {
  flex: 1;
  padding: 10px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.segment.active {
  background: var(--accent-primary);
  color: #fff;
  box-shadow: 0 2px 8px var(--accent-glow);
}

.search-btn {
  margin-top: 8px;
  padding: 14px;
  font-size: 15px;
  justify-content: center;
}

.best-offers-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  padding: 0 4px;
}

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

.route-arrow {
  color: var(--text-subtle);
  font-size: 13px;
}

.offer-meta {
  display: flex;
  gap: 12px;
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
.vehicle-title {
  font-weight: 500;
  color: var(--text-main);
  margin-left: auto;
}

.providers-info-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.providers-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 640px) {
  .providers-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.provider-info-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.provider-info-header {
  display: flex;
  align-items: center;
}

.provider-features {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}
.provider-features li {
  margin-bottom: 6px;
}
.provider-features li:last-child {
  margin-bottom: 0;
}
</style>
