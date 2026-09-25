import { User, UserRoute, UserFilters, NormalizedOffer, RunLog, GlobalSettings } from '../types';
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
    firstName?: string
  ): Promise<void> {
    const id = String(telegramId);
    const chat = String(chatId);
    await this.db
      .prepare(
        `INSERT INTO users (telegram_id, chat_id, username, first_name, status, last_active_at)
         VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
         ON CONFLICT(telegram_id) DO UPDATE SET
           chat_id = excluded.chat_id,
           username = COALESCE(excluded.username, users.username),
           first_name = COALESCE(excluded.first_name, users.first_name),
           last_active_at = CURRENT_TIMESTAMP`
      )
      .bind(id, chat, username || null, firstName || null)
      .run();
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
        merged.allowed_origin_countries || DEFAULT_FILTERS.allowed_origin_countries,
        merged.allowed_destination_countries || DEFAULT_FILTERS.allowed_destination_countries,
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
          booking_url, raw_json, is_active, found_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(fingerprint) DO UPDATE SET
          is_active = CASE WHEN offers.is_dismissed = 1 THEN 0 ELSE 1 END,
          last_seen_at = CURRENT_TIMESTAMP,
          price = COALESCE(excluded.price, offers.price),
          booking_url = COALESCE(excluded.booking_url, offers.booking_url),
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
}
