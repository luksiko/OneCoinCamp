<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { api } from '../../api/rpc';
import { useAppStore } from '../../composables/useAppStore';
import { useI18n } from '../../composables/useI18n';
import type { AdminUser, AdminPayment, AdminPromoCode, AdminRunLog } from '../../api/types';
import AnalyticsTab from './AnalyticsTab.vue';
import { 
  Users, 
  CreditCard, 
  Tag, 
  Send, 
  FileText, 
  Play, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Check, 
  AlertCircle, Activity,
  ShieldCheck,
  Calendar,
  Save,
  Clock,
  Download
} from 'lucide-vue-next';

const { showToast, appState, saveAppData, providersHealth, checkHealth, isHealthLoading, loadAppData } = useAppStore();
const { t } = useI18n();

type AdminSubTab = 'users' | 'payments' | 'promos' | 'broadcast' | 'runs' | 'system' | 'analytics';
const activeSubTab = ref<AdminSubTab>('users');

const users = ref<AdminUser[]>([]);
const payments = ref<AdminPayment[]>([]);
const promoCodes = ref<AdminPromoCode[]>([]);
const runs = ref<AdminRunLog[]>([]);
const isLoading = ref(false);
const adminStats = ref<{
  totalUsers: number;
  activeSubscribers: number;
  totalRoutes: number;
  totalOffers: number;
  totalPayments: number;
  totalRevenue: number;
} | null>(null);

const userRoleFilter = ref<'all' | 'free' | 'premium' | 'admin'>('all');
const userSearch = ref('');

/** Which user card has the actions dropdown open (telegram_id or null) */
const openActionsFor = ref<string | null>(null);

function toggleActions(userId: string) {
  openActionsFor.value = openActionsFor.value === userId ? null : userId;
}

// Promo code creation form
const newPromoCode = ref('');
const newPromoDays = ref(30);
const newPromoMaxUses = ref(10);
const isCreatingPromo = ref(false);

// Broadcast form
const broadcastRole = ref<'all' | 'free' | 'premium'>('all');
const broadcastText = ref('');
const isSendingBroadcast = ref(false);

async function loadStats() {
  try {
    adminStats.value = await api.adminGetStats();
  } catch {}
}

async function loadUsers() {
  isLoading.value = true;
  try {
    users.value = await api.adminListUsers();
  } catch (err: any) {
    showToast(err.message, true);
  } finally {
    isLoading.value = false;
  }
}

async function loadPayments() {
  isLoading.value = true;
  try {
    payments.value = await api.adminGetPayments();
  } catch (err: any) {
    showToast(err.message, true);
  } finally {
    isLoading.value = false;
  }
}

async function loadPromoCodes() {
  isLoading.value = true;
  try {
    promoCodes.value = await api.adminListPromoCodes();
  } catch (err: any) {
    showToast(err.message, true);
  } finally {
    isLoading.value = false;
  }
}

async function loadRuns() {
  isLoading.value = true;
  try {
    runs.value = await api.adminGetRecentRuns();
  } catch (err: any) {
    showToast(err.message, true);
  } finally {
    isLoading.value = false;
  }
}

function switchSubTab(subTab: AdminSubTab) {
  activeSubTab.value = subTab;
  if (subTab === 'users' && users.value.length === 0) loadUsers();
  if (subTab === 'payments' && payments.value.length === 0) loadPayments();
  if (subTab === 'promos' && promoCodes.value.length === 0) loadPromoCodes();
  if (subTab === 'runs' && runs.value.length === 0) loadRuns();
  if (subTab === 'system') {
    checkHealth();
    if (runs.value.length === 0) loadRuns();
  }
}

async function adminRefreshAll() {
  loadStats();
  if (activeSubTab.value === 'users') loadUsers();
  else if (activeSubTab.value === 'payments') loadPayments();
  else if (activeSubTab.value === 'promos') loadPromoCodes();
  else if (activeSubTab.value === 'runs') loadRuns();
  else if (activeSubTab.value === 'system') {
    checkHealth();
    loadRuns();
  }
}

async function adjustSub(userId: string, days: number) {
  try {
    await api.adminAdjustSubscription(userId, days);
    showToast(`Подписка: ${days > 0 ? '+' : ''}${days} дн.`);
    loadUsers();
    loadStats();
  } catch (err: any) {
    showToast(err.message, true);
  }
}

function promptCustomDays(userId: string, name?: string) {
  const input = prompt(`Количество дней подписки для ${name || userId} (+30, -10):`);
  if (!input) return;
  const days = parseInt(input.trim(), 10);
  if (isNaN(days) || days === 0) return;
  adjustSub(userId, days);
}

async function revokeSub(userId: string) {
  if (String(userId) === String(appState.value?.user?.id)) {
    showToast('Нельзя сбросить подписку собственной учетной записи', true);
    return;
  }
  if (!confirm('Отозвать подписку у пользователя?')) return;
  try {
    await api.adminRevokeSubscription(userId);
    showToast(t('toast_sub_revoked') || 'Подписка отозвана');
    loadUsers();
    loadStats();
  } catch (err: any) {
    showToast(err.message, true);
  }
}

async function changeRole(userId: string, newRole: string) {
  if (String(userId) === String(appState.value?.user?.id)) {
    showToast('Нельзя изменить роль собственной учетной записи', true);
    return;
  }
  if (!confirm(`Изменить роль пользователя на ${newRole}?`)) {
    loadUsers();
    return;
  }
  try {
    await api.adminSetRole(userId, newRole);
    showToast(`Роль изменена на ${newRole}`);
    loadUsers();
    loadStats();
  } catch (err: any) {
    showToast(err.message, true);
  }
}

async function handleCreatePromo() {
  const code = newPromoCode.value.trim().toUpperCase();
  if (!code) return;
  isCreatingPromo.value = true;
  try {
    await api.adminCreatePromoCode({
      code,
      days: newPromoDays.value,
      maxUses: newPromoMaxUses.value,
      expiresAt: null,
    });
    showToast(t('toast_promo_created') || 'Промокод создан');
    newPromoCode.value = '';
    loadPromoCodes();
  } catch (err: any) {
    showToast(err.message, true);
  } finally {
    isCreatingPromo.value = false;
  }
}

async function handleDeletePromo(code: string) {
  if (!confirm(`Удалить промокод ${code}?`)) return;
  try {
    await api.adminDeletePromoCode(code);
    showToast(t('toast_promo_deleted') || 'Промокод удалён');
    loadPromoCodes();
  } catch (err: any) {
    showToast(err.message, true);
  }
}

async function handleSendBroadcast() {
  const text = broadcastText.value.trim();
  if (!text) return;
  if (!confirm(`Отправить рассылку получателям (${broadcastRole.value})?`)) return;
  isSendingBroadcast.value = true;
  try {
    const res = await api.adminSendBroadcast(broadcastRole.value, text);
    showToast(`Рассылка завершена. Отправлено: ${res.sent}, Ошибок: ${res.failed}`);
    broadcastText.value = '';
  } catch (err: any) {
    showToast(err.message, true);
  } finally {
    isSendingBroadcast.value = false;
  }
}

async function handleRunScanNow() {
  try {
    showToast(t('status_checking') || 'Запуск проверки...');
    await api.triggerMonitor();
    showToast(t('toast_scan_success') || 'Проверка запущена');
    setTimeout(() => {
      loadRuns();
      loadStats();
    }, 2500);
  } catch (err: any) {
    showToast(err.message, true);
  }
}

async function handleExpireOffersNow() {
  try {
    const count = await api.checkOffersAvailability();
    showToast(`Очищено ${count} истекших офферов`);
    loadStats();
  } catch (err: any) {
    showToast(err.message, true);
  }
}

async function handleReconnectWebhook() {
  try {
    showToast(t('loading') || 'Подключение...');
    await api.registerWebhook();
    showToast(t('toast_webhook_success') || 'Webhook успешно перепривязан');
    loadAppData();
  } catch (err: any) {
    showToast(err.message, true);
  }
}

async function handleToggleProvider(key: string, enabled: boolean) {
  try {
    await api.adminSetProviderToggle(key, enabled);
    showToast(`Провайдер ${enabled ? 'включен' : 'выключен'}`);
    loadAppData();
  } catch (err: any) {
    showToast(err.message, true);
  }
}

function adminExportUsersCsv() {
  const headers = ['Telegram ID', 'Name', 'Username', 'Role', 'Subscription Status', 'Expires At', 'Routes'];
  const rows = users.value.map(u => [
    u.telegram_id,
    `"${(u.first_name || '').replace(/"/g, '""')}"`,
    u.username || '',
    u.role,
    u.subscription_status || '',
    u.subscription_expires_at || '',
    u.route_count || 0,
  ]);
  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `onecoincamp_users_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const filteredUsers = computed(() => {
  return users.value.filter((u) => {
    if (userRoleFilter.value !== 'all' && u.role !== userRoleFilter.value) return false;
    if (userSearch.value) {
      const q = userSearch.value.toLowerCase();
      const matchId = u.telegram_id.includes(q);
      const matchName = u.first_name?.toLowerCase().includes(q);
      const matchUser = u.username?.toLowerCase().includes(q);
      if (!matchId && !matchName && !matchUser) return false;
    }
    return true;
  });
});

onMounted(() => {
  loadStats();
  loadUsers();
});
</script>

<template>
  <div class="admin-tab">
    <!-- KPI Header Card -->
    <div class="glass-card admin-header">
      <div class="header-top-row">
        <div class="section-title">
          <ShieldCheck :size="16" />
          <span>{{ t('admin_crm_title') }}</span>
        </div>
        <button class="btn btn-secondary btn-sm" @click="adminRefreshAll">
          <RefreshCw :size="13" :class="{ spin: isLoading }" />
          <span>{{ t('refresh') }}</span>
        </button>
      </div>

      <!-- KPI Statistics Grid -->
      <div class="kpi-grid">
        <div class="kpi-box">
          <div class="kpi-label">👥 {{ t('admin_kpi_users') }}</div>
          <div class="kpi-value">{{ adminStats ? adminStats.totalUsers : users.length }}</div>
          <div v-if="adminStats" class="kpi-sub">⭐ {{ adminStats.activeSubscribers }} PRO</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">💳 {{ t('admin_kpi_revenue') }}</div>
          <div class="kpi-value">{{ adminStats ? '€' + Number(adminStats.totalRevenue).toFixed(2) : '—' }}</div>
          <div v-if="adminStats" class="kpi-sub">{{ adminStats.totalPayments }} {{ t('admin_tab_payments') }}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">🚗 {{ t('admin_kpi_routes') }}</div>
          <div class="kpi-value">{{ adminStats ? adminStats.totalRoutes : '—' }}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">🎫 {{ t('admin_kpi_offers') }}</div>
          <div class="kpi-value">{{ adminStats ? adminStats.totalOffers : '—' }}</div>
        </div>
      </div>

      <!-- Sub-tabs Horizontal Navigation -->
      <div class="sub-tabs-container">
        <div class="sub-tabs-nav">
          <button
            class="sub-tab-btn"
            :class="{ active: activeSubTab === 'users' }"
            @click="switchSubTab('users')"
          >
            <Users :size="14" />
            <span>{{ t('admin_tab_users') }} ({{ users.length }})</span>
          </button>
          <button
            class="sub-tab-btn"
            :class="{ active: activeSubTab === 'payments' }"
            @click="switchSubTab('payments')"
          >
            <CreditCard :size="14" />
            <span>{{ t('admin_tab_payments') }}</span>
          </button>
          <button
            class="sub-tab-btn"
            :class="{ active: activeSubTab === 'promos' }"
            @click="switchSubTab('promos')"
          >
            <Tag :size="14" />
            <span>{{ t('admin_tab_promos') }}</span>
          </button>
          <button
            class="sub-tab-btn"
            :class="{ active: activeSubTab === 'broadcast' }"
            @click="switchSubTab('broadcast')"
          >
            <Send :size="14" />
            <span>{{ t('admin_tab_broadcast') }}</span>
          </button>
          <button
            class="sub-tab-btn"
            :class="{ active: activeSubTab === 'runs' }"
            @click="switchSubTab('runs')"
          >
            <FileText :size="14" />
            <span>{{ t('admin_tab_runs') }}</span>
          </button>
          <button
            class="sub-tab-btn"
            :class="{ active: activeSubTab === 'system' }"
            @click="switchSubTab('system')"
          >
            <AlertCircle :size="14" />
            <span>{{ t('admin_tab_system') }}</span>
          </button>
          <button
            class="sub-tab-btn"
            :class="{ active: activeSubTab === 'analytics' }"
            @click="switchSubTab('analytics')"
          >
            <Activity :size="14" />
            <span>{{ t('tab_analytics') || 'Analytics' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 1. USERS SUBTAB -->
    <div v-if="activeSubTab === 'users'" class="users-section">
      <div class="glass-card users-filter-card">
        <div class="filter-row">
          <input
            v-model="userSearch"
            type="text"
            class="input search-input"
            :placeholder="t('admin_search_users')"
          />
          <button class="btn btn-secondary btn-sm" @click="adminExportUsersCsv">
            <Download :size="13" />
            <span>{{ t('admin_export_csv') }}</span>
          </button>
        </div>
        <div class="role-chips">
          <button
            v-for="r in ['all', 'premium', 'free', 'admin'] as const"
            :key="r"
            class="chip"
            :class="{ active: userRoleFilter === r }"
            @click="userRoleFilter = r"
          >
            {{ r.toUpperCase() }}
          </button>
        </div>
      </div>

      <div class="users-list">
        <div v-for="u in filteredUsers" :key="u.telegram_id" class="glass-card user-card">
          <div class="user-main">
            <div class="user-title">
              <span class="user-name">{{ u.first_name || '—' }}</span>
              <span v-if="u.username" class="user-handle">@{{ u.username }}</span>
              <span v-if="String(u.telegram_id) === String(appState?.user?.id)" class="badge badge-warning">
                🛡️ Admin (Вы)
              </span>
              <span v-else class="badge" :class="u.role === 'admin' ? 'badge-warning' : (u.role === 'premium' ? 'badge-success' : 'badge-neutral')">
                {{ u.role.toUpperCase() }}
              </span>
            </div>
            <div class="user-sub">
              ID: <code>{{ u.telegram_id }}</code> • Маршрутов: {{ u.route_count || 0 }} • 
              Подписка: {{ u.subscription_expires_at ? new Date(u.subscription_expires_at).toLocaleDateString() : 'нет' }}
            </div>
            <div v-if="String(u.telegram_id) !== String(appState?.user?.id)" class="role-select-row">
              <span class="role-select-label">{{ t('admin_role') }}:</span>
              <select
                :value="u.role"
                class="select role-select"
                @change="(e) => changeRole(u.telegram_id, (e.target as HTMLSelectElement).value)"
              >
                <option value="free">⚪ Free</option>
                <option value="premium">👑 Premium</option>
                <option value="admin">🛡️ Admin</option>
              </select>
            </div>
          </div>

          <!-- Subscription Actions Dropdown -->
          <div class="user-actions-row">
            <button class="btn btn-secondary btn-xs actions-toggle" @click="toggleActions(u.telegram_id)">
              ⋮ {{ t('admin_sub_manage') }}
            </button>
            <div v-if="openActionsFor === u.telegram_id" class="actions-dropdown">
              <button class="action-item action-green" @click="adjustSub(u.telegram_id, 30); openActionsFor = null">+30 {{ t('days_short') || 'days' }}</button>
              <button class="action-item action-green" @click="adjustSub(u.telegram_id, 7); openActionsFor = null">+7 {{ t('days_short') || 'days' }}</button>
              <button class="action-item action-orange" @click="adjustSub(u.telegram_id, -7); openActionsFor = null">−7 {{ t('days_short') || 'days' }}</button>
              <button class="action-item action-orange" @click="adjustSub(u.telegram_id, -30); openActionsFor = null">−30 {{ t('days_short') || 'days' }}</button>
              <button class="action-item" @click="promptCustomDays(u.telegram_id, u.first_name || u.username); openActionsFor = null">✏️ {{ t('admin_custom_days') }}</button>
              <button
                v-if="String(u.telegram_id) !== String(appState?.user?.id) && (u.role === 'premium' || u.subscription_status === 'active')"
                class="action-item action-danger"
                @click="revokeSub(u.telegram_id); openActionsFor = null"
              >
                🗑 {{ t('admin_reset_sub') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. PAYMENTS SUBTAB -->
    <div v-else-if="activeSubTab === 'payments'" class="payments-section">
      <div class="glass-card table-card">
        <div class="section-title" style="margin-bottom: 12px;">{{ t('admin_payments_title') }}</div>
        <div v-if="payments.length === 0" class="empty-text">{{ t('admin_payments_empty') }}</div>
        <div v-else class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Пользователь</th>
                <th>Сумма</th>
                <th>Дней</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in payments" :key="p.id">
                <td>{{ new Date(p.created_at).toLocaleDateString() }}</td>
                <td>{{ p.first_name || p.telegram_id }}</td>
                <td><strong>{{ p.amount }} {{ p.currency }}</strong></td>
                <td>+{{ p.subscription_days }} дн.</td>
                <td><span class="badge badge-success">{{ p.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 3. PROMO CODES SUBTAB -->
    <div v-else-if="activeSubTab === 'promos'" class="promos-section">
      <div class="glass-card promo-create-card">
        <div class="section-title">{{ t('admin_create_promo') }}</div>
        <form class="promo-create-form" @submit.prevent="handleCreatePromo">
          <div class="form-group">
            <label class="form-label">{{ t('admin_promo_code') }}</label>
            <input v-model="newPromoCode" type="text" class="input" placeholder="SUMMER2026" required />
          </div>
          <div class="form-group">
            <label class="form-label">{{ t('admin_promo_days') }}</label>
            <input v-model.number="newPromoDays" type="number" min="1" class="input" required />
          </div>
          <div class="form-group">
            <label class="form-label">{{ t('admin_promo_max_uses') }}</label>
            <input v-model.number="newPromoMaxUses" type="number" min="1" class="input" required />
          </div>
          <button type="submit" class="btn btn-primary" :disabled="isCreatingPromo">
            <Plus :size="15" />
            <span>{{ t('admin_create_btn') }}</span>
          </button>
        </form>
      </div>

      <div class="glass-card table-card">
        <div class="section-title" style="margin-bottom: 12px;">{{ t('admin_promos_title') }}</div>
        <div v-if="promoCodes.length === 0" class="empty-text">{{ t('admin_promos_empty') }}</div>
        <div v-else class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Дней</th>
                <th>Использовано</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pr in promoCodes" :key="pr.code">
                <td><code>{{ pr.code }}</code></td>
                <td>+{{ pr.days }} дн.</td>
                <td>{{ pr.used_count }} / {{ pr.max_uses }}</td>
                <td>
                  <button class="btn btn-danger btn-sm" @click="handleDeletePromo(pr.code)">
                    <Trash2 :size="13" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 4. BROADCAST SUBTAB -->
    <div v-else-if="activeSubTab === 'broadcast'" class="broadcast-section">
      <div class="glass-card broadcast-card">
        <div class="section-title">{{ t('admin_broadcast_title') }}</div>
        <p class="broadcast-sub">{{ t('admin_broadcast_sub') }}</p>

        <div class="form-group" style="margin-top: 14px;">
          <label class="form-label">{{ t('admin_broadcast_recipients') }}</label>
          <select v-model="broadcastRole" class="select">
            <option value="all">{{ t('admin_broadcast_all') }}</option>
            <option value="free">{{ t('admin_broadcast_free') }}</option>
            <option value="premium">{{ t('admin_broadcast_premium') }}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">{{ t('admin_broadcast_placeholder') }}</label>
          <textarea
            v-model="broadcastText"
            rows="5"
            class="input"
            placeholder="Привет! Новые релокации кемперов за 1€..."
          ></textarea>
        </div>

        <button
          class="btn btn-primary"
          :disabled="isSendingBroadcast || !broadcastText.trim()"
          @click="handleSendBroadcast"
        >
          <Send :size="15" />
          <span>{{ isSendingBroadcast ? '...' : t('admin_broadcast_send') }}</span>
        </button>
      </div>
    </div>

    <!-- 5. RUNS SUBTAB -->
    <div v-else-if="activeSubTab === 'runs'" class="runs-section">
      <div class="glass-card table-card">
        <div class="runs-header">
          <div class="section-title">{{ t('admin_runs_title') }}</div>
          <button class="btn btn-secondary btn-sm" @click="loadRuns">
            <RefreshCw :size="13" :class="{ spin: isLoading }" />
            <span>{{ t('refresh') }}</span>
          </button>
        </div>
        <div v-if="runs.length === 0" class="empty-text">{{ t('admin_runs_empty') }}</div>
        <div v-else class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Офферов</th>
                <th>Новых</th>
                <th>Алертов</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="run in runs" :key="run.id">
                <td>{{ new Date(run.started_at).toLocaleTimeString() }} ({{ new Date(run.started_at).toLocaleDateString() }})</td>
                <td>{{ run.total_offers }}</td>
                <td>+{{ run.new_offers }}</td>
                <td>{{ run.alerts_sent }}</td>
                <td>
                  <span class="badge" :class="run.status === 'success' ? 'badge-success' : 'badge-danger'">
                    {{ run.status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 6. SYSTEM SUBTAB (Restored full system settings) -->
    <div v-else-if="activeSubTab === 'system'" class="system-section">
      <!-- Provider Health & Toggles (Unified) -->
      <div class="glass-card system-card">
        <div class="system-header-row">
          <div class="section-title">
            <span>{{ t('site_status') }}</span>
          </div>
          <button class="btn btn-secondary btn-sm" :disabled="isHealthLoading" @click="checkHealth">
            <RefreshCw :size="13" :class="{ spin: isHealthLoading }" />
            <span>{{ t('refresh') }}</span>
          </button>
        </div>
        <div class="providers-unified-list">
          <!-- Roadsurfer Rally -->
          <div class="provider-row">
            <div class="provider-info">
              <div class="provider-name">🚐 Roadsurfer Rally</div>
              <div class="provider-sub">{{ t('provider_desc_roadsurfer') }}</div>
            </div>
            <div class="provider-controls">
              <span class="badge" :class="providersHealth?.roadsurfer?.ok ? 'badge-success' : 'badge-neutral'">
                {{ providersHealth?.roadsurfer?.ok ? t('status_operational') : (providersHealth ? t('status_error_state') : t('status_checking')) }}
              </span>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="appState?.settings?.provider_roadsurfer_enabled !== false"
                  @change="(e) => handleToggleProvider('provider_roadsurfer_enabled', (e.target as HTMLInputElement).checked)"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Movacar API -->
          <div class="provider-row">
            <div class="provider-info">
              <div class="provider-name">🚗 Movacar API</div>
              <div class="provider-sub">{{ t('provider_desc_movacar') }}</div>
            </div>
            <div class="provider-controls">
              <span class="badge" :class="providersHealth?.movacar?.ok ? 'badge-success' : 'badge-neutral'">
                {{ providersHealth?.movacar?.ok ? t('status_operational') : (providersHealth ? t('status_error_state') : t('status_checking')) }}
              </span>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="appState?.settings?.provider_movacar_enabled !== false"
                  @change="(e) => handleToggleProvider('provider_movacar_enabled', (e.target as HTMLInputElement).checked)"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Indie Campers -->
          <div class="provider-row">
            <div class="provider-info">
              <div class="provider-name">⛺ Indie Campers</div>
              <div class="provider-sub">{{ t('provider_desc_indiecampers') }}</div>
            </div>
            <div class="provider-controls">
              <span class="badge" :class="providersHealth?.indiecampers?.ok ? 'badge-success' : 'badge-neutral'">
                {{ providersHealth?.indiecampers?.ok ? t('status_operational') : (providersHealth ? t('status_error_state') : t('status_checking')) }}
              </span>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="appState?.settings?.provider_indiecampers_enabled !== false"
                  @change="(e) => handleToggleProvider('provider_indiecampers_enabled', (e.target as HTMLInputElement).checked)"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Imoova -->
          <div class="provider-row">
            <div class="provider-info">
              <div class="provider-name">🌍 Imoova</div>
              <div class="provider-sub">{{ t('provider_desc_imoova') }}</div>
            </div>
            <div class="provider-controls">
              <span class="badge" :class="providersHealth?.imoova?.ok ? 'badge-success' : 'badge-neutral'">
                {{ providersHealth?.imoova?.ok ? t('status_operational') : (providersHealth ? t('status_error_state') : t('status_checking')) }}
              </span>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="appState?.settings?.provider_imoova_enabled !== false"
                  @change="(e) => handleToggleProvider('provider_imoova_enabled', (e.target as HTMLInputElement).checked)"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Telegram Bot -->
          <div class="provider-row">
            <div class="provider-info">
              <div class="provider-name">🤖 Telegram Bot</div>
              <div class="provider-sub">{{ t('provider_desc_telegram') }}</div>
            </div>
            <div class="provider-controls">
              <span class="badge" :class="appState?.telegramWebhookActive ? 'badge-success' : 'badge-warning'">
                {{ appState?.telegramWebhookActive ? t('webhook_active_desc') : t('webhook_inactive_desc') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions Card -->
      <div class="glass-card system-card">
        <div class="section-title">{{ t('admin_system_title') }}</div>
        <div class="actions-stack">
          <button class="btn btn-primary action-btn" @click="handleRunScanNow">
            <Play :size="15" />
            <span>{{ t('admin_run_now') }}</span>
          </button>
          <button class="btn btn-secondary action-btn" @click="handleExpireOffersNow">
            <Trash2 :size="15" />
            <span>{{ t('admin_expire_now') }}</span>
          </button>
          <button class="btn btn-secondary action-btn" @click="handleReconnectWebhook">
            <RefreshCw :size="15" />
            <span>{{ t('admin_webhook_reconnect') }}</span>
          </button>
        </div>
      </div>
    </div>
    <!-- 7. ANALYTICS SUBTAB -->
    <div v-if="activeSubTab === 'analytics'" class="analytics-section">
      <AnalyticsTab />
    </div>
  </div>
</template>

<style scoped>
.admin-tab {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.admin-header {
  padding: 16px;
}

.header-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

/* KPI Grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

@media (min-width: 640px) {
  .kpi-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.kpi-box {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.kpi-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.kpi-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-main);
  margin-top: 2px;
}

.kpi-sub {
  font-size: 11px;
  color: var(--accent-primary);
  margin-top: 2px;
}

/* Sub-tabs scrolling */
.sub-tabs-container {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.sub-tabs-nav {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  flex-wrap: nowrap;
}

.sub-tabs-nav::-webkit-scrollbar {
  display: none;
}

.sub-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.16s ease;
}

.sub-tab-btn:hover {
  color: var(--text-main);
  background: var(--bg-surface-elevated);
}

.sub-tab-btn.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: #ffffff;
}

/* Users Section */
.users-section, .payments-section, .promos-section, .broadcast-section, .runs-section, .system-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.users-filter-card {
  padding: 14px 16px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.search-input {
  flex: 1;
}

.role-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chip {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
}

.chip.active {
  background: var(--accent-primary);
  color: #ffffff;
  border-color: var(--accent-primary);
}

.users-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.user-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  width: 100%;
  box-sizing: border-box;
}

.user-main {
  width: 100%;
  min-width: 0;
}

.user-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.user-name {
  font-size: 14px;
  font-weight: 700;
}

.user-handle {
  font-size: 12px;
  color: var(--accent-primary);
}

.user-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
  word-break: break-all;
}

.role-select-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.role-select-label {
  font-size: 11px;
  color: var(--text-muted);
}

.role-select {
  padding: 3px 8px;
  font-size: 11px;
  width: auto;
}

.user-sub-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-subtle);
  width: 100%;
}

.user-sub-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Replaced button soup with dropdown */
.user-actions-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-subtle);
}

.actions-toggle {
  align-self: flex-start;
  font-size: 11px;
  padding: 5px 12px;
}

.actions-dropdown {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  animation: fade-in 0.12s ease;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.action-item {
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s ease;
}

.action-item:hover {
  color: var(--text-main);
  background: var(--bg-surface-elevated);
}

.action-item.action-green {
  color: var(--success, #10b981);
  border-color: rgba(16, 185, 129, 0.3);
}

.action-item.action-orange {
  color: var(--warning, #f59e0b);
  border-color: rgba(245, 158, 11, 0.3);
}

.action-item.action-danger {
  color: var(--danger, #ef4444);
  border-color: rgba(239, 68, 68, 0.3);
}

.btn-xs {
  padding: 5px 6px;
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

/* Tables */
.table-card {
  padding: 16px;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.admin-table th {
  padding: 8px 10px;
  color: var(--text-subtle);
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
}

.admin-table td {
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.promo-create-card, .broadcast-card, .system-card {
  padding: 16px;
}

.promo-create-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 12px;
}

@media (min-width: 640px) {
  .promo-create-form {
    grid-template-columns: 2fr 1fr 1fr auto;
    align-items: flex-end;
  }
}

.broadcast-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.empty-text {
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}

.runs-header, .system-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.providers-unified-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
  gap: 12px;
}

.provider-row:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}

.provider-row:first-child {
  padding-top: 2px;
}

.provider-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.provider-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.provider-sub {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
}

.provider-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.provider-controls .badge {
  font-size: 11px;
  padding: 3px 8px;
  white-space: nowrap;
}

.actions-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.action-btn {
  width: 100%;
  justify-content: center;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 20px;
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
  height: 14px;
  width: 14px;
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
</style>
