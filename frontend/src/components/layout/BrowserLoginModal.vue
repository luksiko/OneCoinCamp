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
</style>
