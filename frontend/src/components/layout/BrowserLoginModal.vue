<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';
import { ShieldCheck, ExternalLink, RefreshCw } from 'lucide-vue-next';

const { isLoginLoading, loginCode, loginUrl, loginError, initLogin, stopPolling } = useAuth();
const { t } = useI18n();

onMounted(() => {
  initLogin();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="landing-page">
    <div class="login-wrapper">
      <div class="login-card glass-card">
        <div class="login-header">
          <div class="logo-emoji">🚐</div>
          <h1 class="login-title">OneCoinCamp</h1>
          <p class="login-subtitle">
            {{ t('browser_login_desc') || 'Вход через Telegram для доступа к вашим маршрутам и уведомлениям' }}
          </p>
        </div>

        <div v-if="isLoginLoading" class="loading-state">
          <RefreshCw class="spin" :size="24" />
          <span>{{ t('loading') }}</span>
        </div>

        <div v-else-if="loginError" class="error-state">
          <p class="error-msg">{{ loginError }}</p>
          <button class="btn btn-secondary btn-sm" @click="initLogin">
            <RefreshCw :size="14" />
            <span>{{ t('refresh') || 'Повторить' }}</span>
          </button>
        </div>

        <div v-else class="code-state">
          <div class="code-box">
            <div class="code-label">{{ t('browser_login_code_label') || 'Код подтверждения' }}</div>
            <div class="code-digits">{{ loginCode || '••••••' }}</div>
          </div>

          <a
            v-if="loginUrl"
            :href="loginUrl"
            target="_blank"
            rel="noopener"
            class="btn btn-primary login-btn"
          >
            <span>{{ t('browser_login_btn') || 'Открыть бота в Telegram' }}</span>
            <ExternalLink :size="16" />
          </a>

          <p class="hint-text">
            {{ t('browser_login_hint') || 'Нажмите кнопку выше, нажмите «Старт» в боте и подтвердите 6-значный код.' }}
          </p>
        </div>
      </div>
    </div>

    <div class="providers-info-container">
      <div class="info-intro glass-card">
        <h3>Агрегаторы vs Прямые операторы</h3>
        <p>Важно понимать разницу: <b>Roadsurfer</b> и <b>Indie Campers</b> — прямые операторы (владеют собственным флотом). <b>Movacar</b> и <b>Imoova</b> — маркетплейсы, объединяющие предложения от разных поставщиков. Из-за этого условия (особенно на агрегаторах) могут зависеть от конкретного авто и поставщика.</p>
        <ul class="general-rules">
          <li><b>Подтверждение брони:</b> У прямых операторов бронь происходит мгновенно. На маркетплейсах часто требуется ручное одобрение поставщика (бронь может не состояться).</li>
          <li><b>Топливо:</b> Чаще всего действует правило «полный бак взяли — полный бак вернули».</li>
          <li><b>Штрафы за просрочку:</b> Сдача авто позже времени закрытия депо или согласованного срока грозит начислением дополнительных суток и штрафом.</li>
        </ul>
      </div>

      <div class="providers-grid">
        <div class="provider-info-card glass-card">
          <div class="provider-info-header">
            <span class="provider-tag">Roadsurfer (Rally)</span>
          </div>
          <ul class="provider-features">
            <li><b>Цена:</b> Обычно фиксированная за всю поездку (в Европе от €129, в США от $199 за срок до 7 дней).</li>
            <li><b>Пробег:</b> Расстояние перегона + 25% или 200 км/день. Перепробег платный (напр. €0.50/км).</li>
            <li><b>Залог:</b> Около €800, блокируется на карте на ~30 дней.</li>
            <li><b>Фишки:</b> Второй водитель — бесплатно. Возможен провоз питомца (доплата ~$99-135).</li>
            <li>Изменение сроков возможно только по наличию слотов (и за доплату). Отмена до 48 ч даёт ваучер (50-100%).</li>
          </ul>
        </div>
        
        <div class="provider-info-card glass-card">
          <div class="provider-info-header">
            <span class="provider-tag">Movacar</span>
          </div>
          <ul class="provider-features">
            <li><b>Срок:</b> Для обычных легковых авто (через Sixt) срок ограничен <b>24 часами</b>. Для кемперов (через Roadsurfer/Indie) действуют условия исходного оператора.</li>
            <li><b>Залог:</b> Не €100, а от €300 до €3000 в зависимости от класса авто.</li>
            <li><b>Продление:</b> Возможно как "запрос", который могут отклонить. Отмена меньше чем за 24ч (или неявка) — штраф €50.</li>
            <li>В режиме Xpress (бета) — депозит €150, мин. возраст 25 лет, штраф за отмену в любой момент. Иногда требуется перевод прав для иностранцев.</li>
          </ul>
        </div>

        <div class="provider-info-card glass-card">
          <div class="provider-info-header">
            <span class="provider-tag">Indie Campers</span>
          </div>
          <ul class="provider-features">
            <li>Фиксированные €1 предложения для конкретных дат и локаций.</li>
            <li><b>Нет свободного продления после старта.</b> Изменить дату/время возврата можно только за 48 часов до получения.</li>
            <li>Дополнительные дни докупить можно (до старта аренды), но они будут стоить по <b>полному живому тарифу</b>, а не €1.</li>
          </ul>
        </div>

        <div class="provider-info-card glass-card">
          <div class="provider-info-header">
            <span class="provider-tag">Imoova</span>
          </div>
          <ul class="provider-features">
            <li>Бронирование не подтверждено до одобрения поставщиком.</li>
            <li>Доп. дни покупаются заранее («down-payment on extra days»).</li>
            <li>Депозит (bond) платится поставщику; карта должна быть на имя водителя.</li>
            <li>Опоздания строго караются. Лучше звонить в депо заранее, если не успеваете к закрытию.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  min-height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  max-width: 440px;
  width: 100%;
  text-align: center;
  padding: 36px 28px;
}

.logo-emoji {
  font-size: 42px;
  margin-bottom: 12px;
}

.login-title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}

.login-subtitle {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 24px;
}

.code-box {
  background: var(--bg-surface);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px;
  margin-bottom: 20px;
}

.code-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-subtle);
  margin-bottom: 6px;
  font-weight: 600;
}

.code-digits {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 6px;
  color: var(--accent-primary);
  font-family: monospace;
}

.login-btn {
  width: 100%;
  padding: 14px;
  font-size: 15px;
  margin-bottom: 16px;
}

.hint-text {
  font-size: 12px;
  color: var(--text-subtle);
  line-height: 1.5;
}

.loading-state, .error-state {
  padding: 30px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.spin {
  animation: spin 1s linear infinite;
  color: var(--accent-primary);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-msg {
  color: var(--danger);
  font-size: 14px;
}

.landing-page {
  max-width: 900px;
  margin: 0 auto;
  padding-bottom: 60px;
}

.providers-info-container {
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-intro {
  padding: 20px;
  line-height: 1.5;
  color: var(--text-main);
}
.info-intro h3 {
  font-size: 18px;
  margin-bottom: 12px;
  color: var(--accent-primary);
}
.info-intro p {
  margin-bottom: 12px;
  font-size: 14px;
}
.general-rules {
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
}
.general-rules li {
  margin-bottom: 6px;
}

.providers-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 640px) {
  .providers-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.provider-info-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.provider-info-header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}
.provider-tag {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--accent-primary);
  background: rgba(59, 130, 246, 0.12);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
}

.provider-features {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}
.provider-features li {
  margin-bottom: 8px;
}
.provider-features li:last-child {
  margin-bottom: 0;
}
</style>
