<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { api } from '../../api/rpc';
import { useI18n } from '../../composables/useI18n';
import { useAppStore } from '../../composables/useAppStore';
import type { AnalyticsData } from '../../api/types';
import { BarChart3, Clock, TrendingUp, RefreshCw } from 'lucide-vue-next';

const { t } = useI18n();
const { appState } = useAppStore();

const analytics = ref<AnalyticsData | null>(null);
const isLoading = ref(false);

async function loadAnalytics() {
  isLoading.value = true;
  try {
    const data = await api.getAnalytics();
    analytics.value = data;
  } catch (err) {
    analytics.value = null;
  } finally {
    isLoading.value = false;
  }
}

const maxDailyCount = computed(() => {
  if (!analytics.value?.dailyCounts?.length) return 1;
  return Math.max(...analytics.value.dailyCounts.map((d) => d.total), 1);
});

const maxHourlyCount = computed(() => {
  if (!analytics.value?.hourlyPattern?.length) return 1;
  return Math.max(...analytics.value.hourlyPattern.map((h) => h.count), 1);
});

const maxRouteCount = computed(() => {
  if (!analytics.value?.topRoutes?.length) return 1;
  return Math.max(...analytics.value.topRoutes.map((r) => r.count), 1);
});

function isSilentHour(utcHour: number) {
  if (!appState.value?.filters?.silent_hours_enabled) return false;
  const startStr = appState.value?.filters?.silent_hours_start;
  const endStr = appState.value?.filters?.silent_hours_end;
  if (!startStr || !endStr) return false;
  
  // Heatmap hours are returned in UTC, so we shift them to local browser time to match user expectation
  const offsetHours = -(new Date().getTimezoneOffset() / 60);
  const localHour = (utcHour + offsetHours + 24) % 24;
  
  const startH = parseInt(startStr.split(':')[0], 10);
  const endH = parseInt(endStr.split(':')[0], 10);
  
  if (startH < endH) {
    return localHour >= startH && localHour < endH;
  } else {
    // cross midnight
    return localHour >= startH || localHour < endH;
  }
}

onMounted(() => {
  loadAnalytics();
});
</script>

<template>
  <div class="analytics-tab">
    <div class="glass-card analytics-header">
      <div class="header-left">
        <BarChart3 :size="20" class="header-icon" />
        <div>
          <h2 class="header-title">{{ t('tab_analytics') }}</h2>
          <p class="header-sub">{{ t('analytics_legend_total') }} &amp; {{ t('analytics_legend_matched') }}</p>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" :disabled="isLoading" @click="loadAnalytics">
        <RefreshCw :size="13" :class="{ spin: isLoading }" />
        <span>{{ t('analytics_reload') }}</span>
      </button>
    </div>

    <div v-if="isLoading" class="loading-state">
      <RefreshCw class="spin" :size="24" />
      <span>{{ t('loading') }}</span>
    </div>

    <div v-else-if="!analytics" class="glass-card empty-state">
      <p v-html="t('analytics_empty')"></p>
    </div>

    <div v-else class="analytics-sections">
      <!-- 1. Daily Chart (Last 14 Days) -->
      <div class="glass-card chart-card">
        <div class="section-title">
          <TrendingUp :size="15" />
          <span>{{ t('analytics_daily_title') }}</span>
        </div>
        <div class="daily-bars-container">
          <div
            v-for="day in analytics.dailyCounts.slice(-14)"
            :key="day.date"
            class="bar-column"
            :title="`${day.date}: ${day.total} (${day.matched} ${t('analytics_legend_matched')})`"
          >
            <div class="bar-value">{{ day.total }}</div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ height: `${Math.round((day.total / maxDailyCount) * 100)}%` }"
              ></div>
            </div>
            <div class="bar-label">{{ day.date.slice(5) }}</div>
          </div>
        </div>
        <div class="bar-chart-legend">
          <span><span class="dot total"></span>{{ t('analytics_legend_total') }}</span>
          <span><span class="dot matched"></span>{{ t('analytics_legend_matched') }}</span>
        </div>
      </div>

      <!-- 2. Hourly Heatmap / Distribution (00:00 - 23:00 UTC) -->
      <div class="glass-card chart-card">
        <div class="section-title">
          <Clock :size="15" />
          <span>{{ t('analytics_hourly_title') }}</span>
        </div>
        <div class="hourly-grid">
          <div
            v-for="h in analytics.hourlyPattern"
            :key="h.hour"
            class="hour-cell"
            :class="{ 'is-silent': isSilentHour(h.hour) }"
            :style="{
              background: `rgba(59, 130, 246, ${Math.max(0.12, (h.count / maxHourlyCount) * 0.9)})`,
            }"
            :title="`${h.hour}:00 — ${h.count}${isSilentHour(h.hour) ? ' (Silent Hour)' : ''}`"
          >
            <div class="hour-time">{{ h.hour }}:00</div>
            <div class="hour-count">{{ h.count }}</div>
          </div>
        </div>
        <div class="silent-hours-legend" v-if="appState?.filters?.silent_hours_enabled">
          <span class="legend-box silent"></span>
          <span>Your silent hours ({{ appState?.filters?.silent_hours_start }} - {{ appState?.filters?.silent_hours_end }})</span>
        </div>
      </div>

      <!-- 3. Top Routes & Sources -->
      <div class="grid-2">
        <!-- Top Routes -->
        <div class="glass-card sub-card">
          <div class="section-title" style="margin-bottom: 12px;">
            <span>{{ t('analytics_top_routes_title') }}</span>
          </div>
          <div class="top-list">
            <div v-for="r in analytics.topRoutes.slice(0, 7)" :key="r.route" class="list-item">
              <div class="item-info">
                <span class="item-name">{{ r.route }}</span>
                <span class="item-val">{{ r.count }}</span>
              </div>
              <div class="progress-track">
                <div
                  class="progress-fill"
                  :style="{ width: `${Math.round((r.count / maxRouteCount) * 100)}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- By Sources -->
        <div class="glass-card sub-card">
          <div class="section-title" style="margin-bottom: 12px;">
            <span>{{ t('analytics_by_sources_title') }}</span>
          </div>
          <div class="top-list">
            <div v-for="s in analytics.bySources" :key="s.source" class="list-item">
              <div class="item-info">
                <span class="item-name">{{ s.source }}</span>
                <span class="item-val">{{ s.total }}</span>
              </div>
              <div class="progress-track">
                <div
                  class="progress-fill"
                  style="background: linear-gradient(90deg, #10b981, #059669);"
                  :style="{ width: `${Math.round((s.total / (analytics.dailyCounts.reduce((a, b) => a + b.total, 0) || 1)) * 100)}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analytics-tab {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.analytics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  color: var(--accent-primary);
}

.header-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.header-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.loading-state, .empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}

.analytics-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chart-card, .sub-card {
  padding: 20px;
}

/* Daily Bars */
.daily-bars-container {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 160px;
  padding-top: 24px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.bar-column {
  flex: 1;
  min-width: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
}

.bar-value {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-subtle);
}

.bar-track {
  flex: 1;
  width: 100%;
  max-width: 18px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.bar-fill {
  width: 100%;
  background: var(--accent-gradient);
  border-radius: 4px;
  min-height: 4px;
  transition: height 0.3s ease;
}

.bar-label {
  font-size: 10px;
  color: var(--text-subtle);
  white-space: nowrap;
}

.bar-chart-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
  font-size: 11px;
  color: var(--text-muted);
}

.bar-chart-legend .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.bar-chart-legend .dot.total {
  background: var(--accent-primary);
}

.bar-chart-legend .dot.matched {
  background: #10b981;
}

/* Hourly Heatmap Grid */
.hourly-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  margin-top: 14px;
}

@media (min-width: 640px) {
  .hourly-grid {
    grid-template-columns: repeat(12, 1fr);
  }
}

.hour-cell {
  border-radius: var(--radius-sm);
  padding: 8px 4px;
  text-align: center;
  border: 1px solid var(--border-subtle);
  transition: transform 0.15s ease;
  position: relative;
}

.hour-cell.is-silent {
  opacity: 0.4;
  border: 1px dashed rgba(255, 255, 255, 0.2);
}
.hour-cell.is-silent::after {
  content: '🌙';
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 8px;
  opacity: 0.7;
}

.hour-cell:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
}

.hour-time {
  font-size: 10px;
  color: var(--text-muted);
}

.hour-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
  margin-top: 2px;
}

.silent-hours-legend {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.legend-box {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-box.silent {
  background: rgba(255, 255, 255, 0.1);
  border: 1px dashed rgba(255, 255, 255, 0.3);
}

/* Grid 2 */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 640px) {
  .grid-2 {
    grid-template-columns: 1fr 1fr;
  }
}

.top-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.list-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.item-name {
  font-weight: 600;
  color: var(--text-main);
}

.item-val {
  font-weight: 700;
  color: var(--accent-primary);
}

.progress-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-gradient);
  border-radius: 999px;
  transition: width 0.3s ease;
}
</style>
