import { DbClient } from '../db/client';
import { NormalizedOffer, UserRoute } from '../types';
import { TelegramService } from './telegram';
import { offerMatchesUserFilters, routeMatchesOffer } from './filters';

export interface AlertDispatchResult {
  sent: number;
  retried: number;
  failed: number;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
}

function retryAfterSeconds(message: string, attempts: number): number {
  const explicit = message.match(/retry_after["'=:\s]+(\d+)/i);
  if (explicit) return Math.max(1, Number(explicit[1]));
  return Math.min(3600, 15 * 2 ** Math.min(attempts - 1, 7));
}

function isPermanentTelegramFailure(message: string): boolean {
  return /HTTP (400|401|403|404)\b|bot was blocked|chat not found|user is deactivated/i.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dispatchAlertOutbox(
  db: DbClient,
  telegram: TelegramService,
  options: { maxMessages?: number } = {}
): Promise<AlertDispatchResult> {
  const result: AlertDispatchResult = { sent: 0, retried: 0, failed: 0 };
  const owner = crypto.randomUUID();
  if (!(await db.acquireAlertDispatchLock(owner))) return result;

  const maxMessages = Math.min(40, Math.max(1, Math.floor(options.maxMessages || 40)));
  const lastChatSend = new Map<string, number>();
  let lastGlobalSend = 0;

  try {
    for (let index = 0; index < maxMessages; index++) {
      const item = await db.claimNextAlert(owner);
      if (!item) break;

      try {
        const user = await db.getUser(item.telegram_id);
        const route = item.route_json ? JSON.parse(item.route_json) as UserRoute : undefined;
        const offer = JSON.parse(item.offer_json) as NormalizedOffer;
        const currentRoute = route?.id
          ? (await db.getUserRoutes(item.telegram_id)).find((current) => current.id === route.id && current.enabled)
          : undefined;
        const filters = currentRoute ? await db.getUserFilters(item.telegram_id) : undefined;
        if (!user || user.status !== 'active' || !currentRoute || !filters ||
          !routeMatchesOffer(currentRoute, offer) || !offerMatchesUserFilters(offer, filters, currentRoute)) {
          await db.retryAlert(item, owner, 'User or route is no longer active', 1, true);
          result.failed++;
          continue;
        }

        const now = Date.now();
        const chatDelay = Math.max(0, (lastChatSend.get(item.chat_id) || 0) + 1100 - now);
        const globalDelay = Math.max(0, lastGlobalSend + 50 - now);
        if (Math.max(chatDelay, globalDelay) > 0) await delay(Math.max(chatDelay, globalDelay));

        lastGlobalSend = Date.now();
        lastChatSend.set(item.chat_id, lastGlobalSend);
        await telegram.sendOfferAlert(item.chat_id, offer, currentRoute, Boolean(item.silent));
        await db.completeAlert(item, owner);
        result.sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const permanent = isPermanentTelegramFailure(message);
        const waitSeconds = retryAfterSeconds(message, item.attempts);
        await db.retryAlert(item, owner, message, waitSeconds, permanent);
        if (/chat not found|bot was blocked by the user|user is deactivated/i.test(message)) {
          await db.markUserUnreachable(item.telegram_id);
        }
        if (permanent || item.attempts >= 8) result.failed++;
        else result.retried++;
        console.warn('Telegram alert dispatch failed:', item.telegram_id, message);
        if (/HTTP 429\b|retry_after/i.test(message)) {
          result.rateLimited = true;
          result.retryAfterSeconds = waitSeconds;
          break;
        }
      }
    }
  } finally {
    await db.releaseAlertDispatchLock(owner);
  }

  return result;
}
