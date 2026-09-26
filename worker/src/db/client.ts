import { User, UserRoute, UserFilters, NormalizedOffer, RunLog, GlobalSettings, Payment, PromoCode } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_FILTERS } from '../config';
import { sha256 } from '../utils/crypto';
import type { BrowserTelegramIdentity } from '../utils/telegram-login';

export interface AlertOutboxItem {
  telegram_id: string;
  fingerprint: string;
  chat_id: string;
  offer_json: string;
  route_json: string | null;
  silent: number;
  offer_summary: string;
  attempts: number;
}

export class DbClient {
  constructor(private db: D1Database) {}

  private async browserLoginKey(token: string): Promise<string> {
    return `browser-login:${await sha256(token)}`;
  }

  async createBrowserLoginChallenge(token: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.prepare("DELETE FROM cache WHERE key LIKE 'browser-login:%' AND expires_at <= ?").bind(now).run();
    await this.db.prepare('INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)')
      .bind(await this.browserLoginKey(token), JSON.stringify({ status: 'pending' }), now + 600).run();
  }

  async hasBrowserLoginChallenge(token: string): Promise<boolean> {
    const row = await this.db.prepare('SELECT value FROM cache WHERE key = ? AND expires_at > ?')
      .bind(await this.browserLoginKey(token), Math.floor(Date.now() / 1000)).first<{ value: string }>();
    return row?.value === JSON.stringify({ status: 'pending' });
  }

  async approveBrowserLoginChallenge(token: string, identity: BrowserTelegramIdentity): Promise<boolean> {
    const key = await this.browserLoginKey(token);
    const result = await this.db.prepare('UPDATE cache SET value = ? WHERE key = ? AND value = ? AND expires_at > ?')
      .bind(JSON.stringify({ status: 'approved', identity }), key, JSON.stringify({ status: 'pending' }), Math.floor(Date.now() / 1000)).run();
    return (result.meta.changes || 0) === 1;
  }

  async consumeBrowserLoginChallenge(token: string): Promise<{ status: 'pending' | 'approved' | 'expired'; identity?: BrowserTelegramIdentity }> {
    const key = await this.browserLoginKey(token);
    const row = await this.db.prepare('SELECT value FROM cache WHERE key = ? AND expires_at > ?')
      .bind(key, Math.floor(Date.now() / 1000)).first<{ value: string }>();
    if (!row) return { status: 'expired' };
    const value = JSON.parse(row.value);
    if (value.status !== 'approved') return { status: 'pending' };
    const consumed = await this.db.prepare('DELETE FROM cache WHERE key = ? AND value = ? RETURNING value')
      .bind(key, row.value).first<{ value: string }>();
    if (!consumed) return { status: 'expired' };
    return { status: 'approved', identity: value.identity };
  }

  async acquireMonitorLock(owner: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.prepare(
      `INSERT INTO monitor_locks (name, owner, expires_at) VALUES ('scan', ?, ?)
       ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
       WHERE monitor_locks.expires_at <= ?`
    ).bind(owner, now + 900, now).run();
    return (result.meta.changes || 0) > 0;
  }

  async releaseMonitorLock(owner: string): Promise<void> {
    await this.db.prepare("DELETE FROM monitor_locks WHERE name = 'scan' AND owner = ?").bind(owner).run();
  }

  async getCache<T = any>(key: string): Promise<T | null> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const row = await this.db
        .prepare('SELECT value FROM cache WHERE key = ? AND expires_at > ?')
        .bind(key, now)
        .first<{ value: string }>();
      if (!row || !row.value) return null;
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  async setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
      const strVal = JSON.stringify(value);
      await this.db
        .prepare(
          `INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
        )
        .bind(key, strVal, expiresAt)
        .run();
    } catch (e) {
      console.warn('Failed to set cache for key:', key, e);
    }
  }

  async getUser(telegramId: string | number): Promise<User | null> {
    const id = String(telegramId);
    const row = await this.db
      .prepare('SELECT * FROM users WHERE telegram_id = ?')
      .bind(id)
      .first<any>();
    return row ? (row as User) : null;
  }

  async upsertUser(
    telegramId: string | number,
    chatId: string | number,
    username?: string,
    firstName?: string,
    language?: string
  ): Promise<void> {
    const id = String(telegramId);
    const chat = String(chatId);
    const lang = language ? language.toLowerCase().slice(0, 2) : null;
    await this.db
      .prepare(
        `INSERT INTO users (telegram_id, chat_id, username, first_name, language, status, last_active_at)
         VALUES (?, ?, ?, ?, COALESCE(?, 'en'), 'active', CURRENT_TIMESTAMP)
         ON CONFLICT(telegram_id) DO UPDATE SET
           chat_id = excluded.chat_id,
           username = COALESCE(excluded.username, users.username),
           first_name = COALESCE(excluded.first_name, users.first_name),
           language = COALESCE(users.language, excluded.language),
           status = 'active',
           last_active_at = CURRENT_TIMESTAMP`
      )
      .bind(id, chat, username || null, firstName || null, lang)
      .run();

    const user = await this.getUser(telegramId);
    if (user && user.subscription_status === 'inactive' && !user.subscription_started_at) {
      await this.activateTrial(String(telegramId));
    }
  }

  async listActiveUsers(): Promise<User[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM users WHERE status = 'active'")
      .all<any>();
    return (results || []) as User[];
  }

  async listActiveMonitorContexts(): Promise<Array<{ user: User; routes: UserRoute[]; filters: UserFilters }>> {
    const [usersResult, routesResult, filtersResult] = await Promise.all([
      this.db.prepare("SELECT * FROM users WHERE status = 'active'").all<User>(),
      this.db.prepare("SELECT r.* FROM user_routes r JOIN users u ON u.telegram_id = r.telegram_id WHERE u.status = 'active' AND r.enabled = 1").all<UserRoute>(),
      this.db.prepare("SELECT f.* FROM user_filters f JOIN users u ON u.telegram_id = f.telegram_id WHERE u.status = 'active'").all<UserFilters>(),
    ]);
    const routesByUser = new Map<string, UserRoute[]>();
    for (const route of routesResult.results || []) {
      const routes = routesByUser.get(route.telegram_id) || [];
      routes.push({ ...route, enabled: true });
      routesByUser.set(route.telegram_id, routes);
    }
    const filtersByUser = new Map((filtersResult.results || []).map((filters) => [filters.telegram_id, filters]));
    return (usersResult.results || []).map((user) => {
      const stored = filtersByUser.get(user.telegram_id);
      return {
        user,
        routes: routesByUser.get(user.telegram_id) || [],
        filters: stored
          ? { ...stored, only_campers: Boolean(stored.only_campers), silent_hours_enabled: Boolean(stored.silent_hours_enabled) }
          : { ...DEFAULT_FILTERS, telegram_id: user.telegram_id },
      };
    });
  }

  async setUserLanguage(telegramId: string, language: string): Promise<void> {
    await this.db.prepare('UPDATE users SET language = ? WHERE telegram_id = ?').bind(language, telegramId).run();
  }

  async markUserUnreachable(telegramId: string): Promise<void> {
    await this.db.batch([
      this.db.prepare("UPDATE users SET status = 'unreachable' WHERE telegram_id = ? AND status = 'active'").bind(telegramId),
      this.db.prepare("UPDATE alert_outbox SET status = 'failed', last_error = 'Telegram chat unreachable', updated_at = unixepoch() WHERE telegram_id = ? AND status IN ('pending', 'leased')").bind(telegramId),
    ]);
  }

  async getUserRoutes(telegramId: string | number): Promise<UserRoute[]> {
    const id = String(telegramId);
    const { results } = await this.db
      .prepare('SELECT * FROM user_routes WHERE telegram_id = ? ORDER BY created_at ASC')
      .bind(id)
      .all<any>();
    return (results || []).map((r) => ({
      ...r,
      enabled: Boolean(r.enabled),
    })) as UserRoute[];
  }

  async addUserRoute(telegramId: string | number, route: Partial<UserRoute>): Promise<string> {
    const id = route.id || crypto.randomUUID();
    const tId = String(telegramId);
    await this.db
      .prepare(
        `INSERT INTO user_routes (
          id, telegram_id, enabled, source, origin_name, origin_id, origin_country,
          destination_name, destination_id, destination_country, pickup_date, return_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        tId,
        route.enabled !== false ? 1 : 0,
        route.source || 'roadsurfer',
        route.origin_name || null,
        route.origin_id || '*',
        route.origin_country || null,
        route.destination_name || null,
        route.destination_id || '*',
        route.destination_country || null,
        route.pickup_date || null,
        route.return_date || null
      )
      .run();
    return id;
  }

  async setUserRoutes(telegramId: string | number, routes: Partial<UserRoute>[]): Promise<void> {
    const tId = String(telegramId);
    // Delete existing
    await this.db.prepare('DELETE FROM user_routes WHERE telegram_id = ?').bind(tId).run();
    for (const r of routes) {
      await this.addUserRoute(tId, r);
    }
  }

  async disableUserRoute(telegramId: string | number, routeId: string): Promise<boolean> {
    const tId = String(telegramId);
    const res = await this.db
      .prepare('UPDATE user_routes SET enabled = 0 WHERE id = ? AND telegram_id = ?')
      .bind(routeId, tId)
      .run();
    return (res.meta.changes || 0) > 0;
  }

  async clearUserRoutes(telegramId: string | number): Promise<number> {
    const result = await this.db.prepare('DELETE FROM user_routes WHERE telegram_id = ?')
      .bind(String(telegramId)).run();
    return result.meta.changes || 0;
  }

  async getUserFilters(telegramId: string | number): Promise<UserFilters> {
    const id = String(telegramId);
    const row = await this.db
      .prepare('SELECT * FROM user_filters WHERE telegram_id = ?')
      .bind(id)
      .first<any>();

    if (!row) {
      return {
        telegram_id: id,
        allowed_origin_countries: DEFAULT_FILTERS.allowed_origin_countries,
        allowed_destination_countries: DEFAULT_FILTERS.allowed_destination_countries,
        max_price: DEFAULT_FILTERS.max_price,
        only_campers: DEFAULT_FILTERS.only_campers,
        vehicle_type: DEFAULT_FILTERS.vehicle_type,
        silent_hours_enabled: DEFAULT_FILTERS.silent_hours_enabled,
        silent_hours_start: DEFAULT_FILTERS.silent_hours_start,
        silent_hours_end: DEFAULT_FILTERS.silent_hours_end,
        window_days: DEFAULT_FILTERS.window_days,
        window_start_rule: DEFAULT_FILTERS.window_start_rule,
        roadsurfer_origins_per_run: DEFAULT_FILTERS.roadsurfer_origins_per_run,
      };
    }

    return {
      ...row,
      only_campers: Boolean(row.only_campers),
      silent_hours_enabled: Boolean(row.silent_hours_enabled),
    } as UserFilters;
  }

  async setUserFilters(telegramId: string | number, filters: Partial<UserFilters>): Promise<void> {
    const id = String(telegramId);
    const current = await this.getUserFilters(id);
    const merged = { ...current, ...filters };

    await this.db
      .prepare(
        `INSERT INTO user_filters (
          telegram_id, allowed_origin_countries, allowed_destination_countries, max_price,
          only_campers, vehicle_type, silent_hours_enabled, silent_hours_start, silent_hours_end,
          window_days, window_start_rule, min_duration_days, max_duration_days, roadsurfer_origins_per_run,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(telegram_id) DO UPDATE SET
          allowed_origin_countries = excluded.allowed_origin_countries,
          allowed_destination_countries = excluded.allowed_destination_countries,
          max_price = excluded.max_price,
          only_campers = excluded.only_campers,
          vehicle_type = excluded.vehicle_type,
          silent_hours_enabled = excluded.silent_hours_enabled,
          silent_hours_start = excluded.silent_hours_start,
          silent_hours_end = excluded.silent_hours_end,
          window_days = excluded.window_days,
          window_start_rule = excluded.window_start_rule,
          min_duration_days = excluded.min_duration_days,
          max_duration_days = excluded.max_duration_days,
          roadsurfer_origins_per_run = excluded.roadsurfer_origins_per_run,
          updated_at = CURRENT_TIMESTAMP`
      )
      .bind(
        id,
        merged.allowed_origin_countries ?? DEFAULT_FILTERS.allowed_origin_countries,
        merged.allowed_destination_countries ?? DEFAULT_FILTERS.allowed_destination_countries,
        merged.max_price != null ? merged.max_price : null,
        merged.only_campers ? 1 : 0,
        merged.vehicle_type || 'all',
        merged.silent_hours_enabled ? 1 : 0,
        merged.silent_hours_start || '23:00',
        merged.silent_hours_end || '07:00',
        merged.window_days || 14,
        merged.window_start_rule || 'today',
        merged.min_duration_days != null ? merged.min_duration_days : null,
        merged.max_duration_days != null ? merged.max_duration_days : null,
        merged.roadsurfer_origins_per_run || 20
      )
      .run();
  }

  async hasAlertBeenSent(telegramId: string | number, fingerprint: string): Promise<boolean> {
    const id = String(telegramId);
    const row = await this.db
      .prepare('SELECT 1 FROM sent_alerts WHERE telegram_id = ? AND fingerprint = ?')
      .bind(id, fingerprint)
      .first();
    return row !== null;
  }

  async markAlertSent(
    telegramId: string | number,
    fingerprint: string,
    offerSummary: string
  ): Promise<void> {
    const id = String(telegramId);
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO sent_alerts (telegram_id, fingerprint, offer_summary, sent_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(id, fingerprint, offerSummary || '')
      .run();
  }

  async enqueueAlert(
    telegramId: string | number,
    fingerprint: string,
    chatId: string | number,
    offer: NormalizedOffer,
    route: UserRoute | undefined,
    silent: boolean
  ): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO alert_outbox
       (telegram_id, fingerprint, chat_id, offer_json, route_json, silent, offer_summary)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM sent_alerts WHERE telegram_id = ? AND fingerprint = ?
       )`
    ).bind(
      String(telegramId), fingerprint, String(chatId), JSON.stringify(offer),
      route ? JSON.stringify(route) : null, silent ? 1 : 0,
      `${offer.source}: ${offer.origin} -> ${offer.destination} (${offer.price}€)`,
      String(telegramId), fingerprint
    ).run();
    return (result.meta.changes || 0) > 0;
  }

  async acquireAlertDispatchLock(owner: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.prepare(
      `INSERT INTO monitor_locks (name, owner, expires_at) VALUES ('alert-dispatch', ?, ?)
       ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
       WHERE monitor_locks.expires_at <= ?`
    ).bind(owner, now + 120, now).run();
    return (result.meta.changes || 0) > 0;
  }

  async releaseAlertDispatchLock(owner: string): Promise<void> {
    await this.db.prepare("DELETE FROM monitor_locks WHERE name = 'alert-dispatch' AND owner = ?")
      .bind(owner).run();
  }

  async claimNextAlert(owner: string): Promise<AlertOutboxItem | null> {
    const now = Math.floor(Date.now() / 1000);
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await this.db.prepare(
        `SELECT telegram_id, fingerprint, chat_id, offer_json, route_json, silent,
                offer_summary, attempts
         FROM alert_outbox
         WHERE ((status = 'pending' AND next_attempt_at <= ?)
             OR (status = 'leased' AND lease_until <= ?))
           AND NOT EXISTS (
             SELECT 1 FROM sent_alerts
             WHERE sent_alerts.telegram_id = alert_outbox.telegram_id
               AND sent_alerts.fingerprint = alert_outbox.fingerprint
           )
         ORDER BY next_attempt_at ASC, created_at ASC LIMIT 1`
      ).bind(now, now).first<AlertOutboxItem>();
      if (!row) return null;
      const result = await this.db.prepare(
        `UPDATE alert_outbox SET status = 'leased', lease_owner = ?, lease_until = ?,
           attempts = attempts + 1, updated_at = ?
         WHERE telegram_id = ? AND fingerprint = ?
           AND ((status = 'pending' AND next_attempt_at <= ?)
             OR (status = 'leased' AND lease_until <= ?))`
      ).bind(owner, now + 90, now, row.telegram_id, row.fingerprint, now, now).run();
      if ((result.meta.changes || 0) === 1) return { ...row, attempts: row.attempts + 1 };
    }
    return null;
  }

  async completeAlert(item: AlertOutboxItem, owner: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.batch([
      this.db.prepare(
        `UPDATE alert_outbox SET status = 'sent', sent_at = ?, updated_at = ?,
           lease_until = NULL, last_error = NULL
         WHERE telegram_id = ? AND fingerprint = ? AND status = 'leased' AND lease_owner = ?`
      ).bind(now, now, item.telegram_id, item.fingerprint, owner),
      this.db.prepare(
        `INSERT OR IGNORE INTO sent_alerts (telegram_id, fingerprint, offer_summary, sent_at)
         SELECT telegram_id, fingerprint, offer_summary, CURRENT_TIMESTAMP
         FROM alert_outbox WHERE telegram_id = ? AND fingerprint = ?
           AND status = 'sent' AND lease_owner = ?`
      ).bind(item.telegram_id, item.fingerprint, owner),
    ]);
  }

  async retryAlert(item: AlertOutboxItem, owner: string, error: string, retryAfterSeconds: number, permanent = false): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const next = now + Math.max(1, Math.min(3600, Math.ceil(retryAfterSeconds)));
    await this.db.prepare(
      `UPDATE alert_outbox SET status = ?, next_attempt_at = ?, lease_owner = NULL,
         lease_until = NULL, last_error = ?, updated_at = ?
       WHERE telegram_id = ? AND fingerprint = ? AND status = 'leased' AND lease_owner = ?`
    ).bind(permanent || item.attempts >= 8 ? 'failed' : 'pending', next,
      error.slice(0, 500), now, item.telegram_id, item.fingerprint, owner).run();
  }

  async saveOffer(offer: NormalizedOffer, fingerprint: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO offers (
          fingerprint, source, offer_id, vehicle_id, vehicle, origin, origin_country,
          destination, destination_country, pickup_date, return_date, price, currency,
          booking_url, image_url, raw_json, is_active, found_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(fingerprint) DO UPDATE SET
          is_active = CASE WHEN offers.is_dismissed = 1 THEN 0 ELSE 1 END,
          last_seen_at = CURRENT_TIMESTAMP,
          price = COALESCE(excluded.price, offers.price),
          booking_url = COALESCE(excluded.booking_url, offers.booking_url),
          image_url = COALESCE(excluded.image_url, offers.image_url),
          vehicle = COALESCE(excluded.vehicle, offers.vehicle),
          vehicle_id = COALESCE(excluded.vehicle_id, offers.vehicle_id),
          origin = COALESCE(excluded.origin, offers.origin),
          origin_country = COALESCE(excluded.origin_country, offers.origin_country),
          destination = COALESCE(excluded.destination, offers.destination),
          destination_country = COALESCE(excluded.destination_country, offers.destination_country),
          pickup_date = COALESCE(excluded.pickup_date, offers.pickup_date),
          return_date = COALESCE(excluded.return_date, offers.return_date),
          currency = COALESCE(excluded.currency, offers.currency),
          offer_id = COALESCE(excluded.offer_id, offers.offer_id),
          raw_json = COALESCE(excluded.raw_json, offers.raw_json)`
      )
      .bind(
        fingerprint,
        offer.source,
        offer.offer_id,
        offer.vehicle_id || null,
        offer.vehicle || null,
        offer.origin,
        offer.origin_country || '',
        offer.destination,
        offer.destination_country || '',
        offer.pickup_date,
        offer.return_date,
        offer.price,
        offer.currency || 'EUR',
        offer.booking_url,
        offer.image_url || null,
        offer.raw_json || null
      )
      .run();
  }

  async getOffers(limit = 100, offset = 0): Promise<NormalizedOffer[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM offers WHERE is_active = 1 ORDER BY found_at DESC LIMIT ? OFFSET ?`
      )
      .bind(limit, offset)
      .all<any>();
    return (results || []).map((r) => ({
      source: r.source,
      offer_id: r.offer_id,
      vehicle_id: r.vehicle_id,
      vehicle: r.vehicle,
      origin: r.origin,
      origin_country: r.origin_country,
      destination: r.destination,
      destination_country: r.destination_country,
      pickup_date: r.pickup_date,
      return_date: r.return_date,
      price: r.price,
      currency: r.currency,
      booking_url: r.booking_url,
      raw_json: r.raw_json,
      fingerprint: r.fingerprint,
    }));
  }

  async getOfferArchive(telegramId: string): Promise<any[]> {
    const { results } = await this.db.prepare(
      `SELECT o.*, COALESCE(a.sent_at, o.archived_telegram_sent_at) AS telegram_sent_at
       FROM offers o LEFT JOIN sent_alerts a
         ON a.fingerprint = o.fingerprint AND a.telegram_id = ?
       WHERE o.is_active = 1 ORDER BY o.found_at DESC LIMIT 2000`
    ).bind(telegramId).all<any>();
    return results || [];
  }

  async deleteOffer(fingerprint: string): Promise<void> {
    await this.db
      .prepare('UPDATE offers SET is_active = 0, is_dismissed = 1 WHERE fingerprint = ?')
      .bind(fingerprint)
      .run();
  }

  async expirePastOffers(): Promise<{ checked: number; removed: number }> {
    const total = await this.db.prepare('SELECT COUNT(*) AS count FROM offers WHERE is_active = 1').first<{ count: number }>();
    const result = await this.db.prepare(
      "UPDATE offers SET is_active = 0 WHERE is_active = 1 AND pickup_date IS NOT NULL AND pickup_date < date('now')"
    ).run();
    return { checked: total?.count || 0, removed: result.meta.changes || 0 };
  }

  async logRun(run: RunLog): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO runs (
          started_at, finished_at, source, request_count, offers_found,
          archived, alerts_sent, status, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        run.started_at || new Date().toISOString(),
        run.finished_at || new Date().toISOString(),
        run.source || 'all',
        run.request_count || 0,
        run.offers_found || 0,
        run.archived || 0,
        run.alerts_sent || 0,
        run.status || 'ok',
        run.error || null
      )
      .run();
  }

  async getLatestRun(): Promise<RunLog | null> {
    const row = await this.db
      .prepare('SELECT * FROM runs ORDER BY datetime(started_at) DESC, id DESC LIMIT 1')
      .first<any>();
    return row ? (row as RunLog) : null;
  }

  async getRecentRuns(limit: number = 20): Promise<RunLog[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM runs ORDER BY datetime(started_at) DESC, id DESC LIMIT ?')
      .bind(limit)
      .all<any>();
    return (results || []) as RunLog[];
  }

  async addSentAlertsToLatestRun(count: number): Promise<void> {
    if (count <= 0) return;
    await this.db.prepare(
      'UPDATE runs SET alerts_sent = alerts_sent + ? WHERE id = (SELECT MAX(id) FROM runs)'
    ).bind(count).run();
  }

  async getSettings(): Promise<GlobalSettings> {
    const { results } = await this.db.prepare('SELECT key, value FROM settings').all<any>();
    const res: any = { ...DEFAULT_SETTINGS };
    for (const r of results || []) {
      const val = r.value;
      if (val === 'true') res[r.key] = true;
      else if (val === 'false') res[r.key] = false;
      else if (!isNaN(Number(val)) && val.trim() !== '') res[r.key] = Number(val);
      else res[r.key] = val;
    }
    return res as GlobalSettings;
  }

  async getSetting(key: string): Promise<string | null> {
    const row = await this.db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
    return row?.value ?? null;
  }

  async setSetting(key: string, value: any): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .bind(key, String(value))
      .run();
  }

  // --- Subscription & Role Management ---

  async setUserRole(telegramId: string, role: string): Promise<void> {
    const maxRoutes = role === 'admin' ? null : (role === 'premium' ? null : 2);
    await this.db.prepare(
      'UPDATE users SET role = ?, max_routes = ? WHERE telegram_id = ?'
    ).bind(role, maxRoutes, String(telegramId)).run();
  }

  async setSubscription(
    telegramId: string,
    status: string,
    startedAt: string,
    expiresAt: string
  ): Promise<void> {
    await this.db.prepare(
      `UPDATE users SET subscription_status = ?, subscription_started_at = ?,
       subscription_expires_at = ? WHERE telegram_id = ?`
    ).bind(status, startedAt, expiresAt, String(telegramId)).run();
  }

  async adjustSubscription(telegramId: string, days: number): Promise<{ expiresAt: string | null; status: string; role: string }> {
    const user = await this.getUser(telegramId);
    if (!user) throw new Error('User not found');
    const now = new Date();
    let currentExpiry = user.subscription_expires_at ? new Date(user.subscription_expires_at) : null;
    let baseTime: number;

    if (days >= 0) {
      if (currentExpiry && currentExpiry.getTime() > now.getTime()) {
        baseTime = currentExpiry.getTime();
      } else {
        baseTime = now.getTime();
      }
      const newExpiry = new Date(baseTime + days * 86400000);
      const newStatus = 'active';
      await this.setSubscription(
        telegramId,
        newStatus,
        user.subscription_started_at || now.toISOString(),
        newExpiry.toISOString()
      );
      if (user.role !== 'admin') {
        await this.setUserRole(telegramId, 'premium');
      }
      return { expiresAt: newExpiry.toISOString(), status: newStatus, role: user.role === 'admin' ? 'admin' : 'premium' };
    } else {
      // Subtracting days
      if (!currentExpiry || currentExpiry.getTime() <= now.getTime()) {
        return { expiresAt: null, status: user.subscription_status, role: user.role };
      }
      const newExpiry = new Date(currentExpiry.getTime() + days * 86400000);
      if (newExpiry.getTime() <= now.getTime()) {
        // Expired immediately
        await this.setSubscription(
          telegramId,
          'expired',
          user.subscription_started_at || now.toISOString(),
          new Date().toISOString()
        );
        if (user.role !== 'admin') {
          await this.setUserRole(telegramId, 'free');
        }
        return { expiresAt: new Date().toISOString(), status: 'expired', role: user.role === 'admin' ? 'admin' : 'free' };
      } else {
        await this.setSubscription(
          telegramId,
          'active',
          user.subscription_started_at || now.toISOString(),
          newExpiry.toISOString()
        );
        return { expiresAt: newExpiry.toISOString(), status: 'active', role: user.role };
      }
    }
  }

  async activateSubscription(telegramId: string, days: number): Promise<void> {
    await this.adjustSubscription(telegramId, days);
  }

  async activateTrial(telegramId: string): Promise<boolean> {
    const user = await this.getUser(telegramId);
    if (!user) return false;
    // Only grant trial if user never had a subscription
    if (user.subscription_status !== 'inactive') return false;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1 * 86400000); // 1 day
    await this.setSubscription(telegramId, 'trial', now.toISOString(), expiresAt.toISOString());
    // Trial keeps max_routes = 2
    return true;
  }

  async getExpiredSubscriptions(): Promise<User[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM users
       WHERE subscription_status IN ('active', 'trial')
       AND role != 'admin'
       AND subscription_expires_at IS NOT NULL
       AND datetime(subscription_expires_at) < datetime('now')`
    ).all<any>();
    return (results || []) as User[];
  }

  async listAllUsers(): Promise<(User & { route_count?: number; payment_count?: number })[]> {
    const { results } = await this.db.prepare(
      `SELECT u.*, 
        (SELECT COUNT(*) FROM user_routes r WHERE r.telegram_id = u.telegram_id) as route_count,
        (SELECT COUNT(*) FROM payments p WHERE p.telegram_id = u.telegram_id) as payment_count
       FROM users u 
       ORDER BY u.created_at DESC`
    ).all<any>();
    return (results || []) as (User & { route_count?: number; payment_count?: number })[];
  }

  async recordPayment(payment: Partial<Payment>): Promise<void> {
    await this.db.prepare(
      `INSERT OR IGNORE INTO payments (telegram_id, paddle_transaction_id, amount, currency,
       status, subscription_days) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      payment.telegram_id!,
      payment.paddle_transaction_id || null,
      payment.amount || 0,
      payment.currency || 'EUR',
      payment.status || 'completed',
      payment.subscription_days || 30
    ).run();
  }

  async isPaymentRecorded(transactionId: string): Promise<boolean> {
    const row = await this.db.prepare('SELECT 1 FROM payments WHERE paddle_transaction_id = ?').bind(transactionId).first();
    return row !== null;
  }

  async getUserPayments(telegramId: string): Promise<Payment[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM payments WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(String(telegramId)).all<any>();
    return (results || []) as Payment[];
  }

  async getAllPayments(limit: number = 100): Promise<(Payment & { username?: string; first_name?: string })[]> {
    const { results } = await this.db.prepare(
      `SELECT p.*, u.username, u.first_name 
       FROM payments p 
       LEFT JOIN users u ON p.telegram_id = u.telegram_id 
       ORDER BY p.created_at DESC 
       LIMIT ?`
    ).bind(limit).all<any>();
    return (results || []) as (Payment & { username?: string; first_name?: string })[];
  }

  async getAdminStats(): Promise<{
    totalUsers: number;
    activeSubscribers: number;
    totalRoutes: number;
    totalOffers: number;
    totalPayments: number;
    totalRevenue: number;
  }> {
    const [usersRes, subsRes, routesRes, offersRes, paymentsRes] = await Promise.all([
      this.db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
      this.db.prepare("SELECT COUNT(*) as count FROM users WHERE subscription_status = 'active' OR role = 'premium'").first<{ count: number }>(),
      this.db.prepare('SELECT COUNT(*) as count FROM user_routes').first<{ count: number }>(),
      this.db.prepare('SELECT COUNT(*) as count FROM offers WHERE is_active = 1').first<{ count: number }>(),
      this.db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'").first<{ count: number; total: number }>(),
    ]);

    return {
      totalUsers: usersRes?.count || 0,
      activeSubscribers: subsRes?.count || 0,
      totalRoutes: routesRes?.count || 0,
      totalOffers: offersRes?.count || 0,
      totalPayments: paymentsRes?.count || 0,
      totalRevenue: paymentsRes?.total || 0,
    };
  }

  async setPaddleIds(telegramId: string, customerId: string, subscriptionId?: string): Promise<void> {
    await this.db.prepare(
      'UPDATE users SET paddle_customer_id = ?, paddle_subscription_id = ? WHERE telegram_id = ?'
    ).bind(customerId, subscriptionId || null, String(telegramId)).run();
  }

  isSubscriptionActive(user: User | null): boolean {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!['active', 'trial'].includes(user.subscription_status)) return false;
    if (!user.subscription_expires_at) return false;
    return new Date(user.subscription_expires_at) > new Date();
  }

  getUserMaxRoutes(user: User | null): number {
    if (!user) return 2;
    if (user.role === 'admin') return 999;
    if (user.max_routes === null || user.max_routes === undefined) return 999;
    return user.max_routes;
  }

  // --- Broadcast & Promo Codes ---

  async getRecipientsForBroadcast(targetRole: 'all' | 'free' | 'premium' | 'admin' = 'all'): Promise<{ chat_id: string; telegram_id: string }[]> {
    let query = "SELECT chat_id, telegram_id FROM users WHERE status = 'active' AND chat_id IS NOT NULL";
    if (targetRole === 'premium') {
      query += " AND (role = 'premium' OR subscription_status IN ('active', 'trial'))";
    } else if (targetRole === 'free') {
      query += " AND role = 'free' AND subscription_status NOT IN ('active', 'trial')";
    } else if (targetRole === 'admin') {
      query += " AND role = 'admin'";
    }
    const { results } = await this.db.prepare(query).all<any>();
    return (results || []) as { chat_id: string; telegram_id: string }[];
  }

  async createPromoCode(code: string, days: number, maxUses: number = 1, expiresAt?: string | null): Promise<void> {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) throw new Error('Promo code cannot be empty');
    if (days <= 0) throw new Error('Days must be greater than 0');

    await this.db.prepare(
      `INSERT INTO promo_codes (code, days, max_uses, expires_at)
       VALUES (?, ?, ?, ?)`
    ).bind(cleanCode, days, maxUses || 1, expiresAt || null).run();
  }

  async listPromoCodes(): Promise<PromoCode[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM promo_codes ORDER BY created_at DESC'
    ).all<any>();
    return (results || []) as PromoCode[];
  }

  async deletePromoCode(code: string): Promise<void> {
    await this.db.prepare('DELETE FROM promo_codes WHERE code = ?').bind(code.trim().toUpperCase()).run();
  }

  async redeemPromoCode(
    telegramId: string,
    rawCode: string
  ): Promise<{ success: boolean; error?: string; days?: number; expiresAt?: string }> {
    const code = rawCode.trim().toUpperCase();
    if (!code) return { success: false, error: 'code_empty' };

    const promo = await this.db.prepare(
      'SELECT * FROM promo_codes WHERE code = ?'
    ).bind(code).first<PromoCode>();

    if (!promo) {
      return { success: false, error: 'code_not_found' };
    }

    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return { success: false, error: 'code_expired' };
    }

    if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) {
      return { success: false, error: 'code_exhausted' };
    }

    // Check if this user already redeemed this promo code
    const alreadyRedeemed = await this.db.prepare(
      'SELECT 1 FROM promo_code_redemptions WHERE code = ? AND telegram_id = ?'
    ).bind(code, String(telegramId)).first<any>();

    if (alreadyRedeemed) {
      return { success: false, error: 'code_already_used' };
    }

    // Record redemption
    await this.db.prepare(
      'INSERT INTO promo_code_redemptions (code, telegram_id) VALUES (?, ?)'
    ).bind(code, String(telegramId)).run();

    // Increment usage count
    await this.db.prepare(
      'UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?'
    ).bind(code).run();

    // Grant days to user
    const res = await this.adjustSubscription(telegramId, promo.days);
    return {
      success: true,
      days: promo.days,
      expiresAt: res.expiresAt || undefined,
    };
  }
}
