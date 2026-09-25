<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { api } from '../../api/rpc';
import { useI18n } from '../../composables/useI18n';
import type { AnalyticsData } from '../../api/types';
import { BarChart3, Clock, TrendingUp, RefreshCw } from 'lucide-vue-next';

const { t } = useI18n();

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
          <h2 class="header-title">{{ t('tab_analytics') || 'Аналитика' }}</h2>
          <p class="header-sub">Статистика появления предложений за 1€ по дням и часам</p>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" :disabled="isLoading" @click="loadAnalytics">
        <RefreshCw :size="13" :class="{ spin: isLoading }" />
        <span>{{ t('refresh') || 'Обновить' }}</span>
      </button>
    </div>

    <div v-if="isLoading" class="loading-state">
      <RefreshCw class="spin" :size="24" />
      <span>{{ t('loading') }}</span>
    </div>

    <div v-else-if="!analytics" class="glass-card empty-state">
      <p>Данные аналитики пока недоступны</p>
    </div>

    <div v-else class="analytics-sections">
      <!-- 1. Daily Chart (Last 14 Days) -->
      <div class="glass-card chart-card">
        <div class="section-title">
          <TrendingUp :size="15" />
          <span>Динамика по дням (последние дни)</span>
        </div>
        <div class="daily-bars-container">
          <div
            v-for="day in analytics.dailyCounts.slice(-14)"
            :key="day.date"
            class="bar-column"
            :title="`${day.date}: ${day.total} предложений`"
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
      </div>

      <!-- 2. Hourly Heatmap / Distribution (00:00 - 23:00) -->
      <div class="glass-card chart-card">
        <div class="section-title">
          <Clock :size="15" />
          <span>Лучшие часы для поиска (UTC)</span>
        </div>
        <p class="chart-desc">В это время компании чаще всего выгружают новые релокации</p>
        <div class="hourly-grid">
          <div
            v-for="h in analytics.hourlyPattern"
            :key="h.hour"
            class="hour-cell"
            :style="{
              background: `rgba(59, 130, 246, ${Math.max(0.12, (h.count / maxHourlyCount) * 0.9)})`,
            }"
            :title="`${h.hour}:00 — ${h.count} предл.`"
          >
            <div class="hour-time">{{ h.hour }}:00</div>
            <div class="hour-count">{{ h.count }}</div>
          </div>
        </div>
      </div>

      <!-- 3. Top Routes & Sources -->
      <div class="grid-2">
        <!-- Top Routes -->
        <div class="glass-card sub-card">
          <div class="section-title" style="margin-bottom: 12px;">
            <span>Популярные направления</span>
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
            <span>По провайдерам</span>
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
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.header-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.analytics-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chart-card {
  padding: 20px;
}

.chart-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

/* Daily Bars */
.daily-bars-container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 160px;
  padding-top: 24px;
}

.bar-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.bar-value {
  font-size: 10px;
  color: var(--text-subtle);
  margin-bottom: 4px;
}

.bar-track {
  flex: 1;
  width: 100%;
  max-width: 24px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.bar-fill {
  width: 100%;
  background: var(--accent-gradient);
  border-radius: 6px 6px 0 0;
  transition: height 0.3s ease;
}

.bar-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 6px;
}

/* Hourly Grid */
.hourly-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

@media (min-width: 640px) {
  .hourly-grid {
    grid-template-columns: repeat(12, 1fr);
  }
}

.hour-cell {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 4px;
  text-align: center;
}

.hour-time {
  font-size: 10px;
  color: var(--text-subtle);
}

.hour-count {
  font-size: 13px;
  font-weight: 700;
  color: #ffffff;
  margin-top: 2px;
}

/* Sub-cards and Progress */
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

.sub-card {
  padding: 18px;
}

.top-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  color: var(--text-main);
  font-weight: 600;
}

.item-val {
  color: var(--text-muted);
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
}

.loading-state, .empty-state {
  text-align: center;
  padding: 40px;
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
