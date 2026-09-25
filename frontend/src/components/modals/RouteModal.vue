<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { useI18n } from '../../composables/useI18n';
import { api } from '../../api/rpc';
import type { Route } from '../../api/types';
import { X, Check } from 'lucide-vue-next';

const { isRouteModalOpen, editingRoute, closeRouteModal, saveRoute, appState } = useAppStore();
const { t, getCountryName } = useI18n();

const form = ref<Route>({
  source: 'roadsurfer',
  enabled: true,
  originCountry: 'DE',
  destinationCountry: 'DE',
  originName: '',
  originId: '',
  destinationName: '',
  destinationId: '',
  pickupDate: '',
  returnDate: '',
});

const stations = ref<Array<{ id: string; name: string }>>([]);
const destinations = ref<Array<{ id: string; name: string }>>([]);
const isLoadingStations = ref(false);
const isLoadingDestinations = ref(false);

const providers = [
  { id: 'roadsurfer', label: '🚐 Roadsurfer Rally' },
  { id: 'movacar', label: '🚗 Movacar' },
  { id: 'indiecampers', label: '⛺ Indie Campers' },
  { id: 'imoova', label: '🌐 Imoova' },
];

watch(
  () => editingRoute.value,
  (val) => {
    if (val) {
      form.value = JSON.parse(JSON.stringify(val));
      loadStations();
    }
  },
  { immediate: true }
);

async function loadStations() {
  if (!form.value.source || !form.value.originCountry) return;
  isLoadingStations.value = true;
  try {
    const list = await api.getProviderStations(form.value.source, form.value.originCountry);
    stations.value = list || [];
  } catch {
    stations.value = [];
  } finally {
    isLoadingStations.value = false;
  }
}

async function loadDestinations() {
  if (!form.value.source || !form.value.originId) return;
  isLoadingDestinations.value = true;
  try {
    const list = await api.getProviderDestinations(
      form.value.source,
      form.value.destinationCountry,
      form.value.originId
    );
    destinations.value = list || [];
  } catch {
    destinations.value = [];
  } finally {
    isLoadingDestinations.value = false;
  }
}

function handleOriginCountryChange(code: string) {
  form.value.originCountry = code;
  form.value.originId = '';
  form.value.originName = '';
  loadStations();
}

function handleOriginStationChange(id: string) {
  form.value.originId = id;
  const match = stations.value.find((s) => s.id === id);
  form.value.originName = match ? match.name : id;
  loadDestinations();
}

function handleDestinationCountryChange(code: string) {
  form.value.destinationCountry = code;
  form.value.destinationId = '';
  form.value.destinationName = '';
  loadDestinations();
}

function handleDestinationStationChange(id: string) {
  form.value.destinationId = id;
  const match = destinations.value.find((s) => s.id === id);
  form.value.destinationName = match ? match.name : id;
}

function onSubmit() {
  saveRoute(form.value);
}
</script>

<template>
  <div v-if="isRouteModalOpen" class="modal-backdrop" @click.self="closeRouteModal">
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">{{ t('route_editor_title') || 'Настройка маршрута' }}</h2>
        <button class="close-btn" @click="closeRouteModal">
          <X :size="18" />
        </button>
      </div>

      <form @submit.prevent="onSubmit" class="modal-form">
        <!-- Provider -->
        <div class="form-group">
          <label class="form-label">{{ t('field_provider') || 'Провайдер' }}</label>
          <select v-model="form.source" class="select" @change="loadStations">
            <option v-for="p in providers" :key="p.id" :value="p.id">
              {{ p.label }}
            </option>
          </select>
        </div>

        <!-- Origin Country & Station -->
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">{{ t('field_origin_country') || 'Страна старта' }}</label>
            <select
              :value="form.originCountry"
              class="select"
              @change="(e) => handleOriginCountryChange((e.target as HTMLSelectElement).value)"
            >
              <option value="ALL">🌍 {{ t('country_all') || 'Все страны' }}</option>
              <option v-for="c in appState?.countries || []" :key="c[0]" :value="c[0]">
                {{ getCountryName(c[0]) }} ({{ c[0] }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('field_origin_station') || 'Станция старта' }}</label>
            <select
              :value="form.originId || ''"
              class="select"
              @change="(e) => handleOriginStationChange((e.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('station_any') || 'Любая станция' }}</option>
              <option v-for="s in stations" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Destination Country & Station -->
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">{{ t('field_dest_country') || 'Страна финиша' }}</label>
            <select
              :value="form.destinationCountry"
              class="select"
              @change="(e) => handleDestinationCountryChange((e.target as HTMLSelectElement).value)"
            >
              <option value="ALL">🌍 {{ t('country_all') || 'Все страны' }}</option>
              <option v-for="c in appState?.countries || []" :key="c[0]" :value="c[0]">
                {{ getCountryName(c[0]) }} ({{ c[0] }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('field_dest_station') || 'Станция финиша' }}</label>
            <select
              :value="form.destinationId || ''"
              class="select"
              @change="(e) => handleDestinationStationChange((e.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('station_any') || 'Любая станция' }}</option>
              <option v-for="s in destinations" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Dates (Pickup & Return) -->
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">{{ t('field_date_from') || 'Дата выезда от' }}</label>
            <input v-model="form.pickupDate" type="date" class="input" />
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('field_date_to') || 'Дата выезда до' }}</label>
            <input v-model="form.returnDate" type="date" class="input" />
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeRouteModal">
            {{ t('cancel') || 'Отмена' }}
          </button>
          <button type="submit" class="btn btn-primary">
            <Check :size="16" />
            <span>{{ t('save') || 'Сохранить' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
}

.close-btn:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.08);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 480px) {
  .grid-2 {
    grid-template-columns: 1fr 1fr;
  }
}

.modal-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}
</style>
