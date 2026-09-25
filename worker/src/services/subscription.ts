import { DbClient } from '../db/client';
import { TelegramService } from './telegram';
import { User } from '../types';

export async function expireSubscriptions(
  db: DbClient,
  telegram: TelegramService
): Promise<number> {
  const expired = await db.getExpiredSubscriptions();
  for (const user of expired) {
    await db.setSubscription(
      user.telegram_id, 'expired',
      user.subscription_started_at || '',
      user.subscription_expires_at || ''
    );
    if (user.role !== 'admin') {
      await db.setUserRole(user.telegram_id, 'free');
    }
    try {
      const msg = user.subscription_status === 'trial'
        ? '⏰ <b>Your free trial has ended.</b>\n\nUse /subscribe to get Premium and continue receiving alerts.'
        : '⏰ <b>Your Premium subscription has expired.</b>\n\nMonitoring alerts are paused. Your history is preserved.\nUse /subscribe to renew.';
      await telegram.sendMessage(user.chat_id, msg);
    } catch {}
  }
  return expired.length;
}

export function formatSubscriptionStatus(user: User, isActive: boolean): string {
  if (user.role === 'admin') return '👑 Admin — unlimited access';
  if (!isActive) {
    if (user.subscription_status === 'expired') {
      return '❌ Subscription expired. /subscribe to renew.';
    }
    return '🆓 Free — /subscribe to unlock Premium';
  }
  const expiry = user.subscription_expires_at
    ? new Date(user.subscription_expires_at).toLocaleDateString('en-GB')
    : '?';
  const label = user.subscription_status === 'trial' ? '🆓 Trial' : '👑 Premium';
  return `${label} — active until ${expiry}`;
}
