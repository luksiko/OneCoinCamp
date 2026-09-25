<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { useI18n, type SupportedLang } from '../../composables/useI18n';
import { api } from '../../api/rpc';
import { 
  Bell, 
  Moon, 
  Clock, 
  Calendar, 
  Globe, 
  Save, 
  Sliders,
  Radio,
  Layers,
  Sparkles,
  RefreshCw,
  ExternalLink
} from 'lucide-vue-next';

const { appState, saveAppData, isSaving, showToast, loadAppData } = useAppStore();
const { t, currentLang, setLanguage } = useI18n();

const formFilters = ref({
  silent_hours_enabled: false,
  silent_hours_start: '23:00',
  silent_hours_end: '07:00',
  min_trip_days: null as number | null,
  max_trip_days: null as number | null,
  max_price: null as number | null,
  only_campers: true,
  vehicle_type: 'camper',
});

const formSettings = ref({
  poll_interval_minutes: 5,
  check_neighbors: true,
  telegram_enabled: true,
  notify_all_by_price: false,
  provider_roadsurfer_enabled: true,
  provider_movacar_enabled: true,
  provider_indiecampers_enabled: true,
  provider_imoova_enabled: true,
});

const isReconnectingWebhook = ref(false);

watch(
  () => [appState.value?.settings, appState.value?.filters],
  ([settings, filters]: any[]) => {
    if (settings) {
      formSettings.value = {
        poll_interval_minutes: Number(settings.poll_interval_minutes) || 5,
        check_neighbors: settings.check_neighbors !== undefined ? Boolean(settings.check_neighbors) : true,
        telegram_enabled: settings.telegram_enabled !== undefined ? Boolean(settings.telegram_enabled) : true,
        notify_all_by_price: settings.notify_all_by_price !== undefined ? Boolean(settings.notify_all_by_price) : false,
        provider_roadsurfer_enabled: settings.provider_roadsurfer_enabled !== undefined ? Boolean(settings.provider_roadsurfer_enabled) : true,
        provider_movacar_enabled: settings.provider_movacar_enabled !== undefined ? Boolean(settings.provider_movacar_enabled) : true,
        provider_indiecampers_enabled: settings.provider_indiecampers_enabled !== undefined ? Boolean(settings.provider_indiecampers_enabled) : true,
        provider_imoova_enabled: settings.provider_imoova_enabled !== undefined ? Boolean(settings.provider_imoova_enabled) : true,
      };
    }
    if (filters) {
      formFilters.value = {
        silent_hours_enabled: Boolean(filters.silent_hours_enabled),
        silent_hours_start: filters.silent_hours_start || '23:00',
        silent_hours_end: filters.silent_hours_end || '07:00',
        min_trip_days: filters.min_trip_days != null && filters.min_trip_days !== '' ? Number(filters.min_trip_days) : null,
        max_trip_days: filters.max_trip_days != null && filters.max_trip_days !== '' ? Number(filters.max_trip_days) : null,
        max_price: filters.max_price != null && filters.max_price !== '' ? Number(filters.max_price) : null,
        only_campers: filters.only_campers !== false && filters.vehicle_type !== 'all',
        vehicle_type: filters.only_campers === false || filters.vehicle_type === 'all' ? 'all' : 'camper',
      };
    }
  },
  { immediate: true }
);

const intervals = [1, 5, 10, 15, 30, 60];

function onOnlyCampersChange(val: boolean) {
  formFilters.value.only_campers = val;
  formFilters.value.vehicle_type = val ? 'camper' : 'all';
}

async function handleReconnectWebhook() {
  isReconnectingWebhook.value = true;
  try {
    showToast(t('loading') || 'Подключение...');
    await api.registerWebhook();
    showToast('Webhook успешно перепривязан');
    loadAppData();
  } catch (err: any) {
    showToast(err.message || 'Ошибка привязки вебхука', true);
  } finally {
    isReconnectingWebhook.value = false;
  }
}

function onSave() {
  saveAppData(
    {
      silent_hours_enabled: formFilters.value.silent_hours_enabled,
      silent_hours_start: formFilters.value.silent_hours_start,
      silent_hours_end: formFilters.value.silent_hours_end,
      min_trip_days: formFilters.value.min_trip_days,
      max_trip_days: formFilters.value.max_trip_days,
      max_price: formFilters.value.max_price,
      only_campers: formFilters.value.only_campers,
      vehicle_type: formFilters.value.vehicle_type,
    },
    undefined,
    {
      poll_interval_minutes: formSettings.value.poll_interval_minutes,
      check_neighbors: formSettings.value.check_neighbors,
      telegram_enabled: formSettings.value.telegram_enabled,
      notify_all_by_price: formSettings.value.notify_all_by_price,
      provider_roadsurfer_enabled: formSettings.value.provider_roadsurfer_enabled,
      provider_movacar_enabled: formSettings.value.provider_movacar_enabled,
      provider_indiecampers_enabled: formSettings.value.provider_indiecampers_enabled,
      provider_imoova_enabled: formSettings.value.provider_imoova_enabled,
    }
  );
}
</script>

<template>
  <div class="settings-tab">
    <!-- 1. NOTIFICATIONS & ALERTS -->
    <div class="glass-card settings-card">
      <div class="section-title">
        <Bell :size="15" />
        <span>{{ t('settings_notifications') }}</span>
      </div>

      <!-- Telegram Notifications Enabled -->
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">{{ t('notifications_telegram') }}</div>
          <div class="setting-sub">{{ t('notifications_telegram_sub') }}</div>
        </div>
        <label class="toggle-switch">
          <input v-model="formSettings.telegram_enabled" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- Notify All Slots by Price (Firehose) -->
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">{{ t('notify_all_by_price') }}</div>
          <div class="setting-sub">{{ t('notify_all_desc') }}</div>
        </div>
        <label class="toggle-switch">
          <input v-model="formSettings.notify_all_by_price" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- Silent Hours Toggle -->
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">{{ t('silent_hours') }}</div>
          <div class="setting-sub">{{ t('silent_hours_sub') }}</div>
        </div>
        <label class="toggle-switch">
          <input v-model="formFilters.silent_hours_enabled" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- Silent Hours Time Pickers & Hint -->
      <div v-if="formFilters.silent_hours_enabled" class="silent-block">
        <div class="silent-time-pickers">
          <div class="time-field">
            <span class="time-label">{{ t('silent_start') }}</span>
            <input v-model="formFilters.silent_hours_start" type="time" class="input input-sm" />
          </div>
          <span class="time-separator">–</span>
          <div class="time-field">
            <span class="time-label">{{ t('silent_end') }}</span>
            <input v-model="formFilters.silent_hours_end" type="time" class="input input-sm" />
          </div>
        </div>

        <div class="commands-box">
          <div class="commands-title">{{ t('commands_in_chat') }}</div>
          <div class="commands-list">
            <code>/silent on</code> — {{ t('silent_on') }}<br>
            <code>/silent off</code> — {{ t('silent_off') }}<br>
            <code>/silent 22:00-08:00</code> — {{ t('silent_interval') }}
          </div>
        </div>
      </div>
    </div>

    <!-- 2. SCANNING & MONITOR PARAMETERS -->
    <div class="glass-card settings-card">
      <div class="section-title">
        <Clock :size="15" />
        <span>{{ t('poll_interval') }}</span>
      </div>

      <div class="setting-sub" style="margin-bottom: 12px;">
        {{ t('poll_interval_sub') }}
      </div>

      <div class="intervals-grid">
        <button
          v-for="min in intervals"
          :key="min"
          type="button"
          class="interval-btn"
          :class="{ active: formSettings.poll_interval_minutes === min }"
          @click="formSettings.poll_interval_minutes = min"
        >
          {{ min }} {{ t('minutes') || 'мин' }}
        </button>
      </div>

      <!-- Flexible Dates (±2 days) -->
      <div class="setting-row" style="margin-top: 14px; border-bottom: none;">
        <div class="setting-info">
          <div class="setting-label">{{ t('check_neighbors') }}</div>
        </div>
        <label class="toggle-switch">
          <input v-model="formSettings.check_neighbors" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- 3. TRIP LIMITS & VEHICLE FILTERS -->
    <div class="glass-card settings-card">
      <div class="section-title">
        <Sliders :size="15" />
        <span>{{ t('trip_limits') }}</span>
      </div>

      <!-- Only Campers Toggle -->
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">{{ t('only_campers') }}</div>
          <div class="setting-sub">{{ t('only_campers_sub') }}</div>
        </div>
        <label class="toggle-switch">
          <input
            type="checkbox"
            :checked="formFilters.only_campers"
            @change="(e) => onOnlyCampersChange((e.target as HTMLInputElement).checked)"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="grid-2" style="margin-top: 14px;">
        <div class="form-group">
          <label class="form-label">{{ t('min_days') }}</label>
          <input
            v-model.number="formFilters.min_trip_days"
            type="number"
            min="1"
            max="30"
            class="input"
            :placeholder="t('any_duration')"
          />
        </div>
        <div class="form-group">
          <label class="form-label">{{ t('max_days') }}</label>
          <input
            v-model.number="formFilters.max_trip_days"
            type="number"
            min="1"
            max="60"
            class="input"
            :placeholder="t('any_duration')"
          />
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 0;">
        <label class="form-label">{{ t('max_price') }}</label>
        <input
          v-model.number="formFilters.max_price"
          type="number"
          min="0"
          max="50"
          class="input"
          placeholder="1"
        />
      </div>
    </div>

    <!-- 4. MONITORED PROVIDERS -->
    <div class="glass-card settings-card">
      <div class="section-title">
        <Layers :size="15" />
        <span>{{ t('companies_title') }}</span>
      </div>
      <div class="setting-sub" style="margin-bottom: 12px;">
        {{ t('companies_desc') }}
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">🚐 Roadsurfer Rally</div>
          <div class="setting-sub">Германия, Франция, Испания, Португалия, Италия</div>
        </div>
        <label class="toggle-switch">
          <input v-model="formSettings.provider_roadsurfer_enabled" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">🚗 Movacar</div>
          <div class="setting-sub">Кемперы и авто по Германии и соседним странам</div>
        </div>
        <label class="toggle-switch">
          <input v-model="formSettings.provider_movacar_enabled" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">⛺ Indie Campers</div>
          <div class="setting-sub">Кемпервэны по всей Западной и Южной Европе</div>
        </div>
        <label class="toggle-switch">
          <input v-model="formSettings.provider_indiecampers_enabled" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-row" style="border-bottom: none;">
        <div class="setting-info">
          <div class="setting-label">🌍 Imoova</div>
          <div class="setting-sub">Европа, Великобритания, Австралия, США</div>
        </div>
        <label class="toggle-switch">
          <input v-model="formSettings.provider_imoova_enabled" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- 5. TELEGRAM WEBHOOK CARD -->
    <div class="glass-card settings-card">
      <div class="section-title">
        <Radio :size="15" />
        <span>{{ t('bot_mode') }}</span>
      </div>

      <div class="webhook-row">
        <div class="webhook-info">
          <div class="webhook-badge" :class="appState?.telegramWebhookActive ? 'badge-success' : 'badge-warning'">
            {{ appState?.telegramWebhookActive ? t('webhook_active_desc') : t('webhook_inactive_desc') }}
          </div>
          <div class="setting-sub" style="margin-top: 4px;">{{ t('webhook_rebind_sub') }}</div>
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="isReconnectingWebhook"
          @click="handleReconnectWebhook"
        >
          <RefreshCw :size="13" :class="{ spin: isReconnectingWebhook }" />
          <span>{{ t('btn_reconnect_webhook') }}</span>
        </button>
      </div>
    </div>

    <!-- 6. LANGUAGE SELECTOR CARD -->
    <div class="glass-card settings-card">
      <div class="section-title">
        <Globe :size="15" />
        <span>{{ t('language') }}</span>
      </div>

      <div class="lang-grid">
        <button
          v-for="lang in [
            { id: 'ru', label: '🇷🇺 Русский' },
            { id: 'en', label: '🇬🇧 English' },
            { id: 'de', label: '🇩🇪 Deutsch' },
            { id: 'it', label: '🇮🇹 Italiano' },
            { id: 'uk', label: '🇺🇦 Українська' }
          ]"
          :key="lang.id"
          type="button"
          class="lang-tile"
          :class="{ active: currentLang === lang.id }"
          @click="setLanguage(lang.id as SupportedLang)"
        >
          {{ lang.label }}
        </button>
      </div>
    </div>

    <!-- Sticky Save Button -->
    <div class="save-bar">
      <button class="btn btn-primary save-btn" :disabled="isSaving" @click="onSave">
        <Save :size="16" />
        <span>{{ isSaving ? t('saving') : t('save_settings') }}</span>
      </button>
    </div>

    <!-- Version Footer -->
    <div class="version-footer">
      <span>{{ t('version_label') }}</span>
      <a
        href="https://github.com/luksiko/OneCoinCamp"
        target="_blank"
        rel="noopener noreferrer"
        class="version-link"
      >
        git: <code>0a8b0c0</code>
      </a>
    </div>
  </div>
</template>

<style scoped>
.settings-tab {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.settings-card {
  padding: 18px 20px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  gap: 16px;
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
  min-width: 0;
}

.setting-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.setting-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.4;
}

/* Silent Mode Block */
.silent-block {
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.silent-time-pickers {
  display: flex;
  align-items: center;
  gap: 10px;
}

.time-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-label {
  font-size: 12px;
  color: var(--text-muted);
}

.time-separator {
  color: var(--text-subtle);
  font-weight: 700;
}

.input-sm {
  padding: 6px 10px;
  font-size: 13px;
  width: auto;
}

.commands-box {
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 12px;
}

.commands-title {
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4px;
}

.commands-list {
  color: var(--text-muted);
  line-height: 1.6;
}

.commands-list code {
  color: var(--accent-primary);
  font-weight: 600;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
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
  height: 16px;
  width: 16px;
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

/* Intervals Grid */
.intervals-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

@media (min-width: 480px) {
  .intervals-grid {
    grid-template-columns: repeat(6, 1fr);
  }
}

.interval-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
  text-align: center;
}

.interval-btn:hover {
  background: var(--bg-surface-elevated);
  color: var(--text-main);
}

.interval-btn.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: #ffffff;
}

/* Grid 2 */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

@media (min-width: 480px) {
  .grid-2 {
    grid-template-columns: 1fr 1fr;
  }
}

/* Webhook Row */
.webhook-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.webhook-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

/* Language Tiles */
.lang-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

@media (min-width: 640px) {
  .lang-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.lang-tile {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  text-align: left;
  transition: all 0.16s ease;
}

.lang-tile:hover {
  background: var(--bg-surface-elevated);
  color: var(--text-main);
}

.lang-tile.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: var(--accent-primary);
  color: var(--text-main);
}

.save-bar {
  position: sticky;
  bottom: 70px;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
}

@media (min-width: 768px) {
  .save-bar {
    bottom: 20px;
  }
}

.save-btn {
  box-shadow: var(--shadow-lg);
  padding: 12px 28px;
}

.version-footer {
  text-align: center;
  font-size: 12px;
  color: var(--text-subtle);
  padding: 12px 0 24px;
}

.version-link {
  color: var(--text-muted);
  text-decoration: none;
  border-bottom: 1px dashed var(--text-subtle);
}

.version-link:hover {
  color: var(--accent-primary);
}
</style>
