<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { useI18n } from '../../composables/useI18n';
import type { Route } from '../../api/types';
import { X, Check } from 'lucide-vue-next';

const { isRouteModalOpen, editingRoute, closeRouteModal, saveRoute, appState } = useAppStore();
const { t, getCountryName } = useI18n();

const form = ref<Route>({
  source: 'roadsurfer,movacar,indiecampers,imoova',
  enabled: true,
  originCountry: 'DE',
  destinationCountry: 'PT',
  originName: '',
  originId: '',
  destinationName: '',
  destinationId: '',
  pickupDate: '',
  returnDate: '',
});

const activeProviders = ref<string[]>(['roadsurfer', 'movacar', 'indiecampers', 'imoova']);

const providers = [
  { id: 'roadsurfer', label: '🚐 Roadsurfer' },
  { id: 'movacar', label: '🚗 Movacar' },
  { id: 'indiecampers', label: '⛺ Indie Campers' },
  { id: 'imoova', label: '🌐 Imoova' },
];

watch(
  () => editingRoute.value,
  (val) => {
    if (val) {
      form.value = JSON.parse(JSON.stringify(val));
      const sourceStr = (form.value.source || '').toLowerCase();
      if (sourceStr === 'all' || sourceStr === 'any' || sourceStr === '*') {
        activeProviders.value = ['roadsurfer', 'movacar', 'indiecampers', 'imoova'];
      } else {
        activeProviders.value = sourceStr.split(',').map(s => s.trim()).filter(Boolean);
      }
    } else {
      // Defaults
      form.value = {
        source: 'roadsurfer,movacar,indiecampers,imoova',
        enabled: true,
        originCountry: 'DE',
        destinationCountry: 'PT',
        originName: '',
        originId: '',
        destinationName: '',
        destinationId: '',
        pickupDate: '',
        returnDate: '',
      };
      activeProviders.value = ['roadsurfer', 'movacar', 'indiecampers', 'imoova'];
    }
  },
  { immediate: true }
);

function onSubmit() {
  form.value.source = activeProviders.value.join(',');
  saveRoute(form.value);
}
</script>

<template>
  <div v-if="isRouteModalOpen" class="modal-backdrop" @click.self="closeRouteModal">
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">{{ editingRoute ? (t('route_editor_title_edit') || 'Edit Route') : (t('route_editor_title') || 'Add Route') }}</h2>
        <button class="close-btn" @click="closeRouteModal">
          <X :size="18" />
        </button>
      </div>

      <form @submit.prevent="onSubmit" class="modal-form">
        <!-- Providers -->
        <div class="form-group">
          <label class="form-label">{{ t('field_provider') || 'Providers' }}</label>
          <div class="providers-grid">
            <label v-for="p in providers" :key="p.id" class="provider-checkbox">
              <input type="checkbox" :value="p.id" v-model="activeProviders" />
              <span>{{ p.label }}</span>
            </label>
          </div>
        </div>

        <div class="grid-2">
          <!-- Origin Country -->
          <div class="form-group">
            <label class="form-label">{{ t('field_origin_country') || 'Origin Country' }}</label>
            <select v-model="form.originCountry" class="select">
              <option value="ALL">🌍 {{ t('country_all') || 'All Countries' }}</option>
              <option v-for="c in appState?.countries || []" :key="c[0]" :value="c[0]">
                {{ getCountryName(c[0]) }} ({{ c[0] }})
              </option>
            </select>
          </div>

          <!-- Destination Country -->
          <div class="form-group">
            <label class="form-label">{{ t('field_dest_country') || 'Destination Country' }}</label>
            <select v-model="form.destinationCountry" class="select">
              <option value="ALL">🌍 {{ t('country_all') || 'All Countries' }}</option>
              <option v-for="c in appState?.countries || []" :key="c[0]" :value="c[0]">
                {{ getCountryName(c[0]) }} ({{ c[0] }})
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
          <button type="submit" class="btn btn-primary" :disabled="activeProviders.length === 0">
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

.providers-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.provider-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  cursor: pointer;
  transition: all 0.2s ease;
}

.provider-checkbox:hover {
  background: var(--bg-surface-elevated);
}

.provider-checkbox input[type="checkbox"] {
  accent-color: var(--accent-primary);
  width: 16px;
  height: 16px;
}
</style>
