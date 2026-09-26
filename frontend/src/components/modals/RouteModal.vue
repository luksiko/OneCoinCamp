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
  if (!form.value.source) return;
  isLoadingDestinations.value = true;
  try {
    const list = await api.getProviderDestinations(
      form.value.source,
      form.value.destinationCountry,
      form.value.originId || ''
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

// ── Intent (Quick) Mode ──────────────────────────────────
type SetupMode = 'quick' | 'advanced';
const setupMode = ref<SetupMode>('quick');

const intentOriginCountry = ref('DE');
const intentDirection = ref('any');
const intentPickupDate = ref('');
const intentReturnDate = ref('');

const DIRECTION_COUNTRIES: Record<string, string[]> = {
  south: ['IT', 'ES', 'PT', 'HR', 'GR'],
  west:  ['ES', 'PT', 'FR', 'BE', 'NL'],
  east:  ['PL', 'CZ', 'AT', 'SK', 'HU', 'RO'],
  north: ['DK', 'SE', 'NO', 'FI'],
  any:   [''],  // '' means wildcard (any destination)
};

const directions = [
  { id: 'any',   label: '🌍 Anywhere' },
  { id: 'south', label: '☀️ South — IT, ES, PT, HR, GR' },
  { id: 'west',  label: '🌊 West — ES, PT, FR, BE, NL' },
  { id: 'east',  label: '🏔 East — PL, CZ, AT, SK, HU' },
  { id: 'north', label: '🌲 North — DK, SE, NO, FI' },
];

const isSubmittingIntent = ref(false);

async function onSubmitIntent() {
  isSubmittingIntent.value = true;
  const destCountries = DIRECTION_COUNTRIES[intentDirection.value] ?? [''];
  const allProviders = ['roadsurfer', 'movacar', 'indiecampers', 'imoova'];
  let created = 0;
  for (const source of allProviders) {
    for (const destCountry of destCountries) {
      try {
        await saveRoute({
          source,
          enabled: true,
          originCountry: intentOriginCountry.value,
          destinationCountry: destCountry,
          originId: '',
          originName: '',
          destinationId: '',
          destinationName: '',
          pickupDate: intentPickupDate.value || '',
          returnDate: intentReturnDate.value || '',
        } as any);
        created++;
      } catch { /* skip individual failures */ }
    }
  }
  isSubmittingIntent.value = false;
  closeRouteModal();
}

function onSubmit() {
  if (setupMode.value === 'quick') {
    onSubmitIntent();
  } else {
    saveRoute(form.value);
  }
}
</script>

<template>
  <div v-if="isRouteModalOpen" class="modal-backdrop" @click.self="closeRouteModal">
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">{{ t('route_editor_title') || 'Add Route' }}</h2>
        <button class="close-btn" @click="closeRouteModal">
          <X :size="18" />
        </button>
      </div>

      <!-- Mode Toggle -->
      <div class="mode-tabs">
        <button
          class="mode-tab"
          :class="{ active: setupMode === 'quick' }"
          @click="setupMode = 'quick'"
        >
          ⚡️ Quick Setup
        </button>
        <button
          class="mode-tab"
          :class="{ active: setupMode === 'advanced' }"
          @click="setupMode = 'advanced'"
        >
          ⚙️ Advanced
        </button>
      </div>

      <!-- ── QUICK SETUP FORM ── -->
      <form v-if="setupMode === 'quick'" @submit.prevent="onSubmitIntent" class="modal-form">
        <p class="mode-hint">Creates routes across all providers matching your intent.</p>

        <div class="form-group">
          <label class="form-label">📍 Starting Country</label>
          <select v-model="intentOriginCountry" class="select">
            <option v-for="c in appState?.countries || []" :key="c[0]" :value="c[0]">
              {{ getCountryName(c[0]) }} ({{ c[0] }})
            </option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">🧭 Direction</label>
          <div class="direction-grid">
            <button
              v-for="d in directions"
              :key="d.id"
              type="button"
              class="direction-btn"
              :class="{ active: intentDirection === d.id }"
              @click="intentDirection = d.id"
            >
              {{ d.label }}
            </button>
          </div>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">📅 Pickup from (optional)</label>
            <input v-model="intentPickupDate" type="date" class="input" />
          </div>
          <div class="form-group">
            <label class="form-label">📅 Pickup until (optional)</label>
            <input v-model="intentReturnDate" type="date" class="input" />
          </div>
        </div>

        <div class="intent-preview">
          Will create routes for <strong>all 4 providers</strong>
          from <strong>{{ getCountryName(intentOriginCountry) }}</strong>
          →
          <strong>{{ directions.find(d => d.id === intentDirection)?.label }}</strong>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeRouteModal">
            {{ t('cancel') || 'Cancel' }}
          </button>
          <button type="submit" class="btn btn-primary" :disabled="isSubmittingIntent">
            <Check :size="16" />
            <span>{{ isSubmittingIntent ? 'Creating…' : 'Create Routes' }}</span>
          </button>
        </div>
      </form>

      <!-- ── ADVANCED FORM (original) ── -->
      <form v-else @submit.prevent="saveRoute(form)" class="modal-form">
        <!-- Provider -->
        <div class="form-group">
          <label class="form-label">{{ t('field_provider') || 'Provider' }}</label>
          <select v-model="form.source" class="select" @change="loadStations">
            <option v-for="p in providers" :key="p.id" :value="p.id">
              {{ p.label }}
            </option>
          </select>
        </div>

        <!-- Origin Country & Station -->
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">{{ t('field_origin_country') || 'Origin Country' }}</label>
            <select
              :value="form.originCountry"
              class="select"
              @change="(e) => handleOriginCountryChange((e.target as HTMLSelectElement).value)"
            >
              <option value="ALL">🌍 {{ t('country_all') || 'All Countries' }}</option>
              <option v-for="c in appState?.countries || []" :key="c[0]" :value="c[0]">
                {{ getCountryName(c[0]) }} ({{ c[0] }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('field_origin_station') || 'Origin Station' }}</label>
            <select
              :value="form.originId || ''"
              class="select"
              @change="(e) => handleOriginStationChange((e.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('station_any') || 'Any station' }}</option>
              <option v-for="s in stations" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Destination Country & Station -->
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">{{ t('field_dest_country') || 'Destination Country' }}</label>
            <select
              :value="form.destinationCountry"
              class="select"
              @change="(e) => handleDestinationCountryChange((e.target as HTMLSelectElement).value)"
            >
              <option value="ALL">🌍 {{ t('country_all') || 'All Countries' }}</option>
              <option v-for="c in appState?.countries || []" :key="c[0]" :value="c[0]">
                {{ getCountryName(c[0]) }} ({{ c[0] }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('field_dest_station') || 'Destination Station' }}</label>
            <select
              :value="form.destinationId || ''"
              class="select"
              @change="(e) => handleDestinationStationChange((e.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('station_any') || 'Any station' }}</option>
              <option v-for="s in destinations" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Dates -->
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">{{ t('field_date_from') || 'Pickup date from' }}</label>
            <input v-model="form.pickupDate" type="date" class="input" />
          </div>
          <div class="form-group">
            <label class="form-label">{{ t('field_date_to') || 'Pickup date until' }}</label>
            <input v-model="form.returnDate" type="date" class="input" />
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="closeRouteModal">
            {{ t('cancel') || 'Cancel' }}
          </button>
          <button type="submit" class="btn btn-primary">
            <Check :size="16" />
            <span>{{ t('save') || 'Save' }}</span>
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

/* ── Mode Tabs ─────────────────────────────────────────── */
.mode-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 4px;
  margin-bottom: 20px;
}

.mode-tab {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: calc(var(--radius-md) - 2px);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-tab.active {
  background: var(--accent-primary);
  color: #fff;
}

.mode-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: -4px 0 16px;
}

/* ── Direction Grid ─────────────────────────────────────── */
.direction-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.direction-btn {
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.direction-btn:hover {
  background: var(--bg-surface-elevated);
  color: var(--text-main);
}

.direction-btn.active {
  border-color: var(--accent-primary);
  background: rgba(59, 130, 246, 0.1);
  color: var(--text-main);
}

/* ── Intent Preview ─────────────────────────────────────── */
.intent-preview {
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  margin-top: 4px;
  line-height: 1.5;
}

.intent-preview strong {
  color: var(--text-main);
}
</style>
