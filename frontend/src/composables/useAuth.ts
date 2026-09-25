import { ref, computed } from 'vue';
import { api } from '../api/rpc';

const isTelegramMiniApp = ref(false);
const browserSession = ref<string | null>(null);
const isAuthenticated = ref(false);
const isLoginLoading = ref(false);
const loginCode = ref<string | null>(null);
const loginUrl = ref<string | null>(null);
const loginError = ref<string | null>(null);
let pollTimer: any = null;

function checkInitialAuth() {
  try {
    const hasTg = Boolean(window.Telegram?.WebApp?.initData);
    isTelegramMiniApp.value = hasTg;
    if (hasTg) {
      isAuthenticated.value = true;
      window.Telegram?.WebApp?.ready();
      window.Telegram?.WebApp?.expand();
      return;
    }
  } catch {
    isTelegramMiniApp.value = false;
  }

  const stored = localStorage.getItem('camper_monitor_telegram_session');
  if (stored) {
    browserSession.value = stored;
    isAuthenticated.value = true;
  } else {
    isAuthenticated.value = false;
  }
}

export function useAuth() {
  async function initLogin() {
    if (isAuthenticated.value) return;
    isLoginLoading.value = true;
    loginError.value = null;

    try {
      const challenge = await api.startBrowserLogin();
      loginCode.value = challenge.code;
      loginUrl.value = challenge.loginUrl;
      startPolling(challenge.token);
    } catch (err: any) {
      loginError.value = err.message || 'Не удалось получить код входа';
    } finally {
      isLoginLoading.value = false;
    }
  }

  function startPolling(token: string) {
    if (pollTimer) clearTimeout(pollTimer);

    const poll = async () => {
      try {
        const res = await api.checkBrowserLoginStatus(token);
        if (res.status === 'approved' && res.token) {
          localStorage.setItem('camper_monitor_telegram_session', res.token);
          browserSession.value = res.token;
          isAuthenticated.value = true;
          loginCode.value = null;
          loginUrl.value = null;
          return;
        }
        if (res.status === 'expired') {
          loginError.value = 'Срок действия кода истёк. Попробуйте снова.';
          loginCode.value = null;
          return;
        }
        pollTimer = setTimeout(poll, 2000);
      } catch (err: any) {
        pollTimer = setTimeout(poll, 4000);
      }
    };

    pollTimer = setTimeout(poll, 2000);
  }

  function logout() {
    if (pollTimer) clearTimeout(pollTimer);
    localStorage.removeItem('camper_monitor_telegram_session');
    browserSession.value = null;
    isAuthenticated.value = false;
    loginCode.value = null;
    loginUrl.value = null;
    window.location.reload();
  }

  return {
    isTelegramMiniApp,
    isAuthenticated,
    isLoginLoading,
    loginCode,
    loginUrl,
    loginError,
    checkInitialAuth,
    initLogin,
    logout,
  };
}
