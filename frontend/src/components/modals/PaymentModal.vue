<script setup lang="ts">
import { ref } from 'vue';
import { useAppStore } from '../../composables/useAppStore';
import { useI18n } from '../../composables/useI18n';
import { api } from '../../api/rpc';
import { X, Sparkles, CreditCard, Coins, Check, Tag } from 'lucide-vue-next';

const { isPaymentModalOpen, showToast, loadAppData, appState } = useAppStore();
const { t } = useI18n();

const promoCodeInput = ref('');
const isRedeeming = ref(false);
const isGeneratingInvoice = ref(false);

function closeModal() {
  isPaymentModalOpen.value = false;
}

async function payWithStars() {
  isGeneratingInvoice.value = true;
  try {
    const invoiceLink = await api.generateStarsInvoice();
    if (window.Telegram?.WebApp?.openInvoice) {
      window.Telegram.WebApp.openInvoice(invoiceLink, (status) => {
        if (status === 'paid') {
          showToast(t('toast_sub_activated') || '🎉 Подписка активирована!');
          closeModal();
          loadAppData();
        }
      });
    } else {
      window.open(invoiceLink, '_blank');
    }
  } catch (err: any) {
    showToast(err.message || 'Ошибка генерации счёта Stars', true);
  } finally {
    isGeneratingInvoice.value = false;
  }
}

async function payWithCrypto() {
  isGeneratingInvoice.value = true;
  try {
    const payUrl = await api.generateCryptoInvoice();
    if (window.Telegram?.WebApp?.openTelegramLink && payUrl.startsWith('https://t.me/')) {
      window.Telegram.WebApp.openTelegramLink(payUrl);
    } else {
      window.open(payUrl, '_blank');
    }
    showToast(t('toast_crypto_opened') || 'Счёт CryptoBot открыт');
  } catch (err: any) {
    showToast(err.message || 'Ошибка генерации крипто-счёта', true);
  } finally {
    isGeneratingInvoice.value = false;
  }
}

function payWithPaddle() {
  const token = appState.value?.paddleClientToken;
  const priceId = appState.value?.paddlePriceId;

  if (window.Paddle && token && priceId) {
    try {
      window.Paddle.Initialize({ token, environment: 'production' });
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customData: { telegram_id: appState.value?.user?.id },
      });
      closeModal();
    } catch (err: any) {
      showToast('Ошибка инициализации Paddle', true);
    }
  } else {
    showToast('Оплата картой временно недоступна', true);
  }
}

async function handleRedeemPromo() {
  const code = promoCodeInput.value.trim();
  if (!code) return;
  isRedeeming.value = true;
  try {
    const res = await api.redeemPromoCode(code);
    showToast(res.message || '🎉 Промокод применён!');
    promoCodeInput.value = '';
    closeModal();
    loadAppData();
  } catch (err: any) {
    showToast(err.message || 'Ошибка применения промокода', true);
  } finally {
    isRedeeming.value = false;
  }
}
</script>

<template>
  <div v-if="isPaymentModalOpen" class="modal-backdrop" @click.self="closeModal">
    <div class="modal-content payment-card">
      <div class="modal-header">
        <div class="plan-header">
          <div class="plan-badge">PREMIUM</div>
          <h2 class="plan-title">OneCoinCamp PRO</h2>
          <div class="plan-price">€4.99 <span class="plan-period">/ {{ t('month') || 'месяц' }}</span></div>
        </div>
        <button class="close-btn" @click="closeModal">
          <X :size="18" />
        </button>
      </div>

      <ul class="features-list">
        <li>✨ {{ t('feat_unlimited_routes') || 'Неограниченное число маршрутов' }}</li>
        <li>⚡ {{ t('feat_instant_alerts') || 'Мгновенные уведомления о новых кемперах' }}</li>
        <li>📊 {{ t('feat_full_analytics') || 'Полная аналитика и графики' }}</li>
        <li>🗺️ {{ t('feat_all_providers') || 'Все провайдеры (Roadsurfer, Movacar, Indie, Imoova)' }}</li>
      </ul>

      <!-- Payment Methods -->
      <div class="payment-methods">
        <!-- Telegram Stars -->
        <button class="pay-btn stars-btn" :disabled="isGeneratingInvoice" @click="payWithStars">
          <div class="pay-btn-icon">⭐</div>
          <div class="pay-btn-text">
            <div class="pay-btn-title">{{ t('pay_stars_title') }}</div>
            <div class="pay-btn-sub">{{ t('pay_stars_sub') }}</div>
          </div>
        </button>

        <!-- Credit Card (Paddle) -->
        <button class="pay-btn card-btn" @click="payWithPaddle">
          <CreditCard :size="22" class="pay-icon" />
          <div class="pay-btn-text">
            <div class="pay-btn-title">{{ t('pay_card_title') }}</div>
            <div class="pay-btn-sub">{{ t('pay_card_sub') }}</div>
          </div>
        </button>

        <!-- CryptoBot -->
        <button class="pay-btn crypto-btn" :disabled="isGeneratingInvoice" @click="payWithCrypto">
          <Coins :size="22" class="pay-icon" />
          <div class="pay-btn-text">
            <div class="pay-btn-title">{{ t('pay_crypto_title') }}</div>
            <div class="pay-btn-sub">{{ t('pay_crypto_sub') }}</div>
          </div>
        </button>
      </div>

      <!-- Promo Code Section -->
      <div class="promo-section">
        <div class="promo-label">
          <Tag :size="14" />
          <span>{{ t('promo_have_code') }}</span>
        </div>
        <form class="promo-form" @submit.prevent="handleRedeemPromo">
          <input
            v-model="promoCodeInput"
            type="text"
            class="input promo-input"
            placeholder="PROMOCODE"
          />
          <button type="submit" class="btn btn-secondary btn-sm" :disabled="isRedeeming || !promoCodeInput.trim()">
            <Check :size="14" />
            <span>{{ isRedeeming ? '...' : t('apply') }}</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.payment-card {
  max-width: 480px;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.plan-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  padding: 3px 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, #f59e0b, #ea580c);
  color: #ffffff;
  margin-bottom: 6px;
}

.plan-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.plan-price {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-primary);
  margin-top: 2px;
}

.plan-period {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
}

.features-list {
  list-style: none;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--text-main);
}

.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}

.pay-btn {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  transition: all 0.16s ease;
}

.pay-btn:hover {
  background: var(--bg-surface-elevated);
  border-color: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.pay-btn-icon {
  font-size: 24px;
}

.pay-icon {
  color: var(--accent-primary);
}

.pay-btn-title {
  font-size: 14px;
  font-weight: 700;
}

.pay-btn-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.promo-section {
  border-top: 1px solid var(--border-subtle);
  padding-top: 18px;
}

.promo-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.promo-form {
  display: flex;
  gap: 8px;
}

.promo-input {
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.05em;
}
</style>
