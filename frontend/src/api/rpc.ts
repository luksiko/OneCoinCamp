import type {
  AppStateData,
  OffersFilterPayload,
  OffersResponse,
  ProvidersHealth,
  AnalyticsData,
  AdminUser,
  AdminPayment,
  AdminPromoCode,
  AdminRunLog,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE || window.location.origin;

function getInitData(): string {
  try {
    return window.Telegram?.WebApp?.initData || '';
  } catch {
    return '';
  }
}

function getBrowserSession(): string {
  try {
    return localStorage.getItem('camper_monitor_telegram_session') || '';
  } catch {
    return '';
  }
}

async function callRpc<T = any>(method: string, args: any[] = [], options?: RequestInit): Promise<T> {
  const initData = getInitData();
  const session = getBrowserSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (initData) {
    headers['X-Telegram-Init-Data'] = initData;
  }
  if (session) {
    headers['Authorization'] = `Bearer ${session}`;
  }

  const response = await fetch(`${API_BASE}/api/rpc`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ method, args }),
    ...(options || {})
  });

  if (response.status === 401 && session) {
    localStorage.removeItem('camper_monitor_telegram_session');
    window.location.reload();
    throw new Error('Сессия истекла. Войдите через Telegram ещё раз.');
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Ошибка сервера (${response.status})`);
  }

  if (data.error) {
    throw new Error(data.error);
  }
  return data.result as T;
}

export const api = {
  // Core user actions
  getUiData: () => callRpc<AppStateData>('getUiData'),
  saveUiData: (payload: { language?: string; routes?: any[]; filters?: any; settings?: any }, options?: RequestInit) =>
    callRpc<{ ok: boolean; error?: string }>('saveUiData', [payload], options),
  checkProvidersHealth: () => callRpc<ProvidersHealth>('checkProvidersHealth'),
  triggerMonitor: () => callRpc<any>('runMonitorFromUi'),
  checkOffersAvailability: () => callRpc<number>('checkOffersAvailabilityWeb'),
  registerWebhook: () => callRpc<any>('registerTelegramWebhookWeb'),

  // Station and destination suggestions (Notice backend signatures: getProviderStations(provider, countries[]), getProviderDestinations(provider, originId, countries[]))
  getProviderStations: (provider: string, country?: string) =>
    callRpc<Array<{ id: string; name: string }>>('getProviderStations', [
      provider,
      country && country !== 'ALL' ? [country] : [],
    ]),
  getProviderDestinations: (provider: string, country: string, originId: string) =>
    callRpc<Array<{ id: string; name: string }>>('getProviderDestinations', [
      provider,
      originId || '*',
      country && country !== 'ALL' ? [country] : [],
    ]),

  // Offers & Analytics
  
  getFavorites: () => callRpc<import("./types").Offer[]>('getFavorites'),
  toggleFavorite: (offerId: string) => callRpc<boolean>('toggleFavorite', [offerId]),

  getOffers: (filters: OffersFilterPayload) => callRpc<OffersResponse>('getOffers', [filters]),
  deleteOffer: (offerId: string) => callRpc<{ success: boolean }>('deleteOffer', [offerId]),
  getAnalytics: () => callRpc<AnalyticsData>('getAnalytics'),

  // Payments & Promo
  generateStarsInvoice: () => callRpc<string>('generateStarsInvoice'),
  generateCryptoInvoice: () => callRpc<string>('generateCryptoInvoice'),
  redeemPromoCode: (code: string) => callRpc<{ success: boolean; message: string }>('redeemPromoCodeWeb', [code]),

  // Admin CRM
  adminListUsers: () => callRpc<AdminUser[]>('adminListUsers'),
  adminSetRole: (userId: string, role: string) => callRpc<any>('adminSetRole', [userId, role]),
  adminAdjustSubscription: (userId: string, days: number) =>
    callRpc<any>('adminAdjustSubscription', [userId, days]),
  adminRevokeSubscription: (userId: string) => callRpc<any>('adminRevokeSubscription', [userId]),
  adminGetPayments: (userId?: string) => callRpc<AdminPayment[]>('adminGetPayments', [userId]),
  adminGetStats: () => callRpc<any>('adminGetStats'),
  adminListPromoCodes: () => callRpc<AdminPromoCode[]>('adminListPromoCodes'),
  adminCreatePromoCode: (payload: { code: string; days: number; maxUses: number; expiresAt: string | null }) =>
    callRpc<any>('adminCreatePromoCode', [payload]),
  adminDeletePromoCode: (code: string) => callRpc<any>('adminDeletePromoCode', [code]),
  adminSetProviderToggle: (key: string, enabled: boolean) =>
    callRpc<any>('adminSetProviderToggle', [key, enabled]),
  adminGetRecentRuns: () => callRpc<AdminRunLog[]>('adminGetRecentRuns'),
  adminSendBroadcast: (role: string, text: string) => callRpc<{ sent: number; failed: number }>('adminSendBroadcast', [role, text]),

  // Browser Telegram Auth APIs
  startBrowserLogin: async () => {
    const res = await fetch(`${API_BASE}/api/auth/telegram/start`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start login');
    return data as { token: string; code: string; loginUrl: string };
  },
  checkBrowserLoginStatus: async (token: string) => {
    const res = await fetch(`${API_BASE}/api/auth/telegram/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login check error');
    return data as { status: 'pending' | 'approved' | 'expired'; token?: string };
  },
};
