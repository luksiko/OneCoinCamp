<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { api } from '../../api/rpc';
import { useAppStore } from '../../composables/useAppStore';
import type { AdminUser, AdminPayment, AdminPromoCode, AdminRunLog } from '../../api/types';
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
  AlertCircle 
} from 'lucide-vue-next';

const { showToast } = useAppStore();

type AdminSubTab = 'users' | 'payments' | 'promos' | 'broadcast' | 'runs' | 'settings';
const activeSubTab = ref<AdminSubTab>('users');

const users = ref<AdminUser[]>([]);
const payments = ref<AdminPayment[]>([]);
const promoCodes = ref<AdminPromoCode[]>([]);
const runs = ref<AdminRunLog[]>([]);
const isLoading = ref(false);

const userRoleFilter = ref<'all' | 'free' | 'premium' | 'admin'>('all');
const userSearch = ref('');

// Promo code creation form
const newPromoCode = ref('');
const newPromoDays = ref(30);
const newPromoMaxUses = ref(10);
const isCreatingPromo = ref(false);

// Broadcast form
const broadcastRole = ref<'all' | 'free' | 'premium'>('all');
const broadcastText = ref('');
const isSendingBroadcast = ref(false);

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
}

async function adjustSub(userId: string, days: number) {
  try {
    await api.adminAdjustSubscription(userId, days);
    showToast(`Подписка изменена на ${days > 0 ? '+' : ''}${days} дн.`);
    loadUsers();
  } catch (err: any) {
    showToast(err.message, true);
  }
}

async function revokeSub(userId: string) {
  if (!confirm('Отозвать подписку у пользователя?')) return;
  try {
    await api.adminRevokeSubscription(userId);
    showToast('Подписка отозвана');
    loadUsers();
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
    showToast('Промокод создан');
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
    showToast('Промокод удалён');
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
  loadUsers();
});
</script>

<template>
  <div class="admin-tab">
    <div class="glass-card admin-header">
      <div class="section-title">
        <span>Панель администратора (CRM)</span>
      </div>

      <!-- Sub-tabs nav -->
      <div class="sub-tabs-nav">
        <button
          class="sub-tab-btn"
          :class="{ active: activeSubTab === 'users' }"
          @click="switchSubTab('users')"
        >
          <Users :size="14" />
          <span>Пользователи ({{ users.length }})</span>
        </button>
        <button
          class="sub-tab-btn"
          :class="{ active: activeSubTab === 'payments' }"
          @click="switchSubTab('payments')"
        >
          <CreditCard :size="14" />
          <span>Платежи</span>
        </button>
        <button
          class="sub-tab-btn"
          :class="{ active: activeSubTab === 'promos' }"
          @click="switchSubTab('promos')"
        >
          <Tag :size="14" />
          <span>Промокоды</span>
        </button>
        <button
          class="sub-tab-btn"
          :class="{ active: activeSubTab === 'broadcast' }"
          @click="switchSubTab('broadcast')"
        >
          <Send :size="14" />
          <span>Рассылка</span>
        </button>
        <button
          class="sub-tab-btn"
          :class="{ active: activeSubTab === 'runs' }"
          @click="switchSubTab('runs')"
        >
          <FileText :size="14" />
          <span>Логи запусков</span>
        </button>
        <button
          class="sub-tab-btn"
          :class="{ active: activeSubTab === 'settings' }"
          @click="switchSubTab('settings')"
        >
          <AlertCircle :size="14" />
          <span>Системные настройки</span>
        </button>
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
            placeholder="Поиск по ID, username, имени..."
          />
          <div class="role-chips">
            <button
              v-for="r in ['all', 'free', 'premium', 'admin'] as const"
              :key="r"
              class="chip"
              :class="{ active: userRoleFilter === r }"
              @click="userRoleFilter = r"
            >
              {{ r.toUpperCase() }}
            </button>
          </div>
        </div>
      </div>

      <div class="users-list">
        <div v-for="u in filteredUsers" :key="u.telegram_id" class="glass-card user-card">
          <div class="user-main">
            <div class="user-title">
              <span class="user-name">{{ u.first_name || 'Без имени' }}</span>
              <span v-if="u.username" class="user-handle">@{{ u.username }}</span>
              <span class="badge" :class="u.role === 'admin' ? 'badge-warning' : (u.role === 'premium' ? 'badge-success' : 'badge-neutral')">
                {{ u.role.toUpperCase() }}
              </span>
            </div>
            <div class="user-sub">
              ID: <code>{{ u.telegram_id }}</code> • Маршрутов: {{ u.route_count || 0 }} • 
              Подписка: {{ u.subscription_expires_at ? new Date(u.subscription_expires_at).toLocaleDateString() : 'нет' }}
            </div>
          </div>

          <div class="user-actions">
            <button class="btn btn-secondary btn-sm" @click="adjustSub(u.telegram_id, 30)">
              +30 дн.
            </button>
            <button class="btn btn-secondary btn-sm" @click="adjustSub(u.telegram_id, 7)">
              +7 дн.
            </button>
            <button v-if="u.role === 'premium'" class="btn btn-danger btn-sm" @click="revokeSub(u.telegram_id)">
              Отозвать
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. PAYMENTS SUBTAB -->
    <div v-else-if="activeSubTab === 'payments'" class="payments-section">
      <div class="glass-card table-card">
        <div class="section-title" style="margin-bottom: 12px;">История платежей</div>
        <div v-if="payments.length === 0" class="empty-text">Платежей пока нет</div>
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
      <!-- Create Promo Code -->
      <div class="glass-card promo-create-card">
        <div class="section-title">Создать промокод</div>
        <form class="promo-create-form" @submit.prevent="handleCreatePromo">
          <div class="form-group">
            <label class="form-label">Код</label>
            <input v-model="newPromoCode" type="text" class="input" placeholder="SUMMER2026" required />
          </div>
          <div class="form-group">
            <label class="form-label">Дней подписки</label>
            <input v-model.number="newPromoDays" type="number" min="1" class="input" required />
          </div>
          <div class="form-group">
            <label class="form-label">Макс. использований</label>
            <input v-model.number="newPromoMaxUses" type="number" min="1" class="input" required />
          </div>
          <button type="submit" class="btn btn-primary" :disabled="isCreatingPromo">
            <Plus :size="15" />
            <span>Создать</span>
          </button>
        </form>
      </div>

      <!-- Promos List -->
      <div class="glass-card table-card">
        <div class="section-title" style="margin-bottom: 12px;">Активные промокоды</div>
        <div v-if="promoCodes.length === 0" class="empty-text">Промокодов пока нет</div>
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
        <div class="section-title">Рассылка сообщений в Telegram</div>
        <p class="broadcast-sub">Сообщение получат пользователи через Telegram-бота</p>

        <div class="form-group" style="margin-top: 14px;">
          <label class="form-label">Получатели</label>
          <select v-model="broadcastRole" class="select">
            <option value="all">Всем пользователям</option>
            <option value="free">Только Free пользователям</option>
            <option value="premium">Только PRO пользователям</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Текст сообщения (поддерживается HTML)</label>
          <textarea
            v-model="broadcastText"
            rows="5"
            class="input"
            placeholder="Привет! Новые скидки на кемперы..."
          ></textarea>
        </div>

        <button
          class="btn btn-primary"
          :disabled="isSendingBroadcast || !broadcastText.trim()"
          @click="handleSendBroadcast"
        >
          <Send :size="15" />
          <span>{{ isSendingBroadcast ? 'Отправка...' : 'Отправить рассылку' }}</span>
        </button>
      </div>
    </div>

    <!-- 5. RUNS SUBTAB -->
    <div v-else-if="activeSubTab === 'runs'" class="runs-section">
      <div class="glass-card table-card">
        <div class="section-title" style="margin-bottom: 12px;">История циклов сканирования</div>
        <div v-if="runs.length === 0" class="empty-text">Логов пока нет</div>
        <div v-else class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Время старта</th>
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

    <!-- 6. SETTINGS SUBTAB -->
    <div v-else-if="activeSubTab === 'settings'" class="settings-section">
      <div class="glass-card admin-settings-card">
        <div class="section-title">Системные настройки</div>
        
        <div class="form-group" style="margin-top: 14px;">
          <label class="form-label">Интервал сканирования (минуты)</label>
          <div class="intervals-grid">
            <button
              v-for="min in [1, 5, 10, 15, 30]"
              :key="min"
              class="interval-btn"
              :class="{ active: useAppStore().appState.value?.settings?.poll_interval_minutes === min }"
              @click="useAppStore().saveAppData({}, undefined, { poll_interval_minutes: min })"
            >
              {{ min }} мин.
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.admin-header {
  padding: 16px 20px;
}

.sub-tabs-nav {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-top: 14px;
  padding-bottom: 4px;
}

.sub-tabs-nav::-webkit-scrollbar {
  display: none;
}

.sub-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
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

.users-section, .payments-section, .promos-section, .broadcast-section, .runs-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.users-filter-card {
  padding: 14px 16px;
}

.filter-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

@media (min-width: 640px) {
  .filter-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.search-input {
  max-width: 320px;
}

.role-chips {
  display: flex;
  gap: 6px;
}

.chip {
  padding: 5px 10px;
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
}

.user-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 18px;
}

@media (min-width: 640px) {
  .user-card {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.user-title {
  display: flex;
  align-items: center;
  gap: 8px;
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
  margin-top: 3px;
}

.user-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* Tables */
.table-card {
  padding: 20px;
}

.table-responsive {
  overflow-x: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.admin-table th {
  padding: 8px 12px;
  color: var(--text-subtle);
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
}

.admin-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.promo-create-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 14px;
}

@media (min-width: 640px) {
  .promo-create-form {
    grid-template-columns: 2fr 1fr 1fr auto;
    align-items: flex-end;
  }
}

.broadcast-card {
  padding: 20px;
}

.broadcast-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.empty-text {
  color: var(--text-muted);
  font-size: 13px;
  padding: 20px 0;
  text-align: center;
}

.admin-settings-card {
  padding: 20px;
}

.intervals-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  max-width: 400px;
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
</style>
