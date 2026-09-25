<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { useI18n, type SupportedLang } from '../../composables/useI18n';
import type { UserSettings } from '../../api/types';
import { 
  Bell, 
  Moon, 
  Clock, 
  DollarSign, 
  Calendar, 
  Globe, 
  Save, 
  Check 
} from 'lucide-vue-next';

const { appState, saveAppData, isSaving } = useAppStore();
const { t, currentLang, setLanguage } = useI18n();

const form = ref<UserSettings>({
  poll_interval_minutes: 10,
  telegram_notifications_enabled: true,
  notify_all_offers: false,
  silent_hours_enabled: false,
  silent_hours_start: '23:00',
  silent_hours_end: '08:00',
  max_price: null,
  min_duration_days: null,
  max_duration_days: null,
});

watch(
  () => [appState.value?.settings, appState.value?.filters],
  ([settings, filters]) => {
    if (settings || filters) {
      form.value = {
        ...form.value,
        ...(settings as any || {}),
        ...(filters as any || {}),
        min_duration_days: (filters as any)?.min_trip_days ?? form.value.min_duration_days,
        max_duration_days: (filters as any)?.max_trip_days ?? form.value.max_duration_days,
      };
    }
  },
  { immediate: true }
);

const intervals = [1, 5, 10, 15, 30];

function onSave() {
  saveAppData(
    {
      silent_hours_enabled: form.value.silent_hours_enabled,
      silent_hours_start: form.value.silent_hours_start,
      silent_hours_end: form.value.silent_hours_end,
      min_trip_days: form.value.min_duration_days,
      max_trip_days: form.value.max_duration_days,
      max_price: form.value.max_price,
    },
    undefined,
    {
      poll_interval_minutes: form.value.poll_interval_minutes,
      telegram_enabled: form.value.telegram_notifications_enabled,
    }
  );
}
</script>

<template>
  <div class="settings-tab">
    <div class="glass-card settings-card">
      <div class="section-title">
        <Bell :size="15" />
        <span>{{ t('settings_notifications') || 'Уведомления' }}</span>
      </div>

      <!-- Telegram Notifications Enabled -->
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">{{ t('notifications_telegram') || 'Уведомления в Telegram' }}</div>
          <div class="setting-sub">Получать алерты о найденных релокациях в боте</div>
        </div>
        <label class="toggle-switch">
          <input v-model="form.telegram_notifications_enabled" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- Notify All Offers (Firehose) -->
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">{{ t('notify_all') || 'Все новые офферы (без фильтра)' }}</div>
          <div class="setting-sub">Присылать все кемперы за 1€ по всей Европе</div>
        </div>
        <label class="toggle-switch">
          <input v-model="form.notify_all_offers" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- Silent Hours -->
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">{{ t('silent_hours') || 'Тихие часы (ночной режим)' }}</div>
          <div class="setting-sub">Не присылать уведомления в указанный промежуток времени</div>
        </div>
        <label class="toggle-switch">
          <input v-model="form.silent_hours_enabled" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div v-if="form.silent_hours_enabled" class="silent-time-pickers">
        <div class="time-field">
          <span class="time-label">{{ t('silent_start') || 'Начало' }}</span>
          <input v-model="form.silent_hours_start" type="time" class="input input-sm" />
        </div>
        <div class="time-field">
          <span class="time-label">{{ t('silent_end') || 'Конец' }}</span>
          <input v-model="form.silent_hours_end" type="time" class="input input-sm" />
        </div>
      </div>
    </div>

    <!-- Scanner Interval -->
    <div class="glass-card settings-card">
      <div class="section-title">
        <Clock :size="15" />
        <span>{{ t('poll_interval') || 'Частота сканирования' }}</span>
      </div>
      <p class="setting-sub" style="margin-bottom: 12px;">Как часто сканер проверяет новые предложения</p>
      
      <div class="intervals-grid">
        <button
          v-for="min in intervals"
          :key="min"
          class="interval-btn"
          :class="{ active: form.poll_interval_minutes === min }"
          @click="form.poll_interval_minutes = min"
        >
          {{ min }} мин.
        </button>
      </div>
    </div>

    <!-- Duration & Price Filters -->
    <div class="glass-card settings-card">
      <div class="section-title">
        <Calendar :size="15" />
        <span>{{ t('trip_limits') || 'Ограничения поездки' }}</span>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">{{ t('min_days') || 'Мин. дней поездки' }}</label>
          <input v-model.number="form.min_duration_days" type="number" min="1" max="30" class="input" placeholder="Не ограничено" />
        </div>
        <div class="form-group">
          <label class="form-label">{{ t('max_days') || 'Макс. дней поездки' }}</label>
          <input v-model.number="form.max_duration_days" type="number" min="1" max="60" class="input" placeholder="Не ограничено" />
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 0;">
        <label class="form-label">{{ t('max_price') || 'Макс. цена (€)' }}</label>
        <input v-model.number="form.max_price" type="number" min="1" max="100" class="input" placeholder="Например: 5" />
      </div>
    </div>

    <!-- Language Selector Card -->
    <div class="glass-card settings-card">
      <div class="section-title">
        <Globe :size="15" />
        <span>{{ t('language') || 'Язык приложения' }}</span>
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
        <span>{{ isSaving ? (t('saving') || 'Сохранение...') : (t('save_settings') || 'Сохранить настройки') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.settings-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-card {
  padding: 20px;
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
}

.silent-time-pickers {
  display: flex;
  gap: 16px;
  padding-top: 12px;
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

.input-sm {
  padding: 6px 10px;
  font-size: 13px;
  width: auto;
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
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.interval-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 4px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
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
  padding: 12px 24px;
}
</style>
