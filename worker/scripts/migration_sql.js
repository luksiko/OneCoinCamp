const sqlText = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;

function sqlNumber(value, field) {
  if (value === null || value === undefined || value === '') return 'NULL';
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be a finite number`);
  return String(number);
}

function required(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') throw new Error(`${field} is missing`);
  return String(value);
}

export function buildMigrationSql(data) {
  if (!Array.isArray(data) || data.length === 0) throw new Error('Expected a nonempty array of exported users');
  const statements = [];
  const counts = { users: 0, filters: 0, routes: 0, alerts: 0 };
  const routeOwners = new Map();

  for (const item of data) {
    if (!item?.user) throw new Error('Each export item must contain a user');
    if (!Array.isArray(item.routes) || !Array.isArray(item.sent_alerts)) {
      throw new Error('Export is incomplete: each user needs routes and sent_alerts arrays. Create a fresh Firestore export.');
    }
    const u = item.user;
    const userId = required(u.telegram_id ?? u._id, 'telegram_id');
    const createdAt = u.created_at || new Date().toISOString();
    const activeAt = u.last_seen_at || u.last_active_at || createdAt;
    statements.push(`INSERT INTO users (telegram_id, chat_id, username, first_name, status, language, created_at, last_active_at)
VALUES (${sqlText(userId)}, ${sqlText(u.chat_id ?? userId)}, ${sqlText(u.username)}, ${sqlText(u.first_name)}, ${sqlText(u.status || 'active')}, ${sqlText(u.language || 'en')}, ${sqlText(createdAt)}, ${sqlText(activeAt)})
ON CONFLICT(telegram_id) DO UPDATE SET chat_id=excluded.chat_id, username=excluded.username, first_name=excluded.first_name, status=excluded.status, language=excluded.language, created_at=excluded.created_at, last_active_at=excluded.last_active_at;`);
    counts.users++;

    const f = item.filters || {};
    const countries = (value, fallback) => Array.isArray(value) ? value.join(',') : (value || fallback);
    const quiet = f.silent_hours;
    const quietEnabled = quiet ? quiet.enabled !== false : Boolean(f.silent_hours_enabled);
    statements.push(`INSERT INTO user_filters (telegram_id, allowed_origin_countries, allowed_destination_countries, max_price, only_campers, vehicle_type, silent_hours_enabled, silent_hours_start, silent_hours_end, window_days, window_start_rule, min_duration_days, max_duration_days, roadsurfer_origins_per_run)
VALUES (${sqlText(userId)}, ${sqlText(countries(f.allowed_origin_countries, 'DE,AT,NL,BE,FR,CH'))}, ${sqlText(countries(f.allowed_destination_countries, 'ES,IT,FR,DE,AT,NL,BE,PT,DK,HR,SI,CH,PL,CZ'))}, ${sqlNumber(f.price_max ?? f.max_price, 'price_max')}, ${f.only_campers ? 1 : 0}, ${sqlText(f.vehicle_type || 'all')}, ${quietEnabled ? 1 : 0}, ${sqlText(quiet?.start || quiet?.from || f.silent_hours_start || '23:00')}, ${sqlText(quiet?.end || quiet?.to || f.silent_hours_end || '07:00')}, ${sqlNumber(f.window_days ?? 14, 'window_days')}, ${sqlText(f.window_start_rule || 'today')}, ${sqlNumber(f.min_duration_days, 'min_duration_days')}, ${sqlNumber(f.max_duration_days, 'max_duration_days')}, ${sqlNumber(f.roadsurfer_origins_per_run ?? 15, 'roadsurfer_origins_per_run')})
ON CONFLICT(telegram_id) DO UPDATE SET allowed_origin_countries=excluded.allowed_origin_countries, allowed_destination_countries=excluded.allowed_destination_countries, max_price=excluded.max_price, only_campers=excluded.only_campers, vehicle_type=excluded.vehicle_type, silent_hours_enabled=excluded.silent_hours_enabled, silent_hours_start=excluded.silent_hours_start, silent_hours_end=excluded.silent_hours_end, window_days=excluded.window_days, window_start_rule=excluded.window_start_rule, min_duration_days=excluded.min_duration_days, max_duration_days=excluded.max_duration_days, roadsurfer_origins_per_run=excluded.roadsurfer_origins_per_run;`);
    counts.filters++;

    for (const r of item.routes) {
      const routeId = required(r._id ?? r.id, 'route ID');
      const owner = routeOwners.get(routeId);
      if (owner && owner !== userId) throw new Error(`Route ID collision across users: ${routeId}`);
      routeOwners.set(routeId, userId);
      statements.push(`INSERT INTO user_routes (id, telegram_id, enabled, source, origin_name, origin_id, origin_country, destination_name, destination_id, destination_country, pickup_date, return_date)
VALUES (${sqlText(routeId)}, ${sqlText(userId)}, ${r.enabled !== false ? 1 : 0}, ${sqlText(r.source || 'roadsurfer')}, ${sqlText(r.originName || r.origin_name)}, ${sqlText(r.originId || r.origin_id || '*')}, ${sqlText(r.originCountry || r.origin_country)}, ${sqlText(r.destinationName || r.destination_name)}, ${sqlText(r.destinationId || r.destination_id || '*')}, ${sqlText(r.destinationCountry || r.destination_country)}, ${sqlText(r.pickupDate || r.pickup_date)}, ${sqlText(r.returnDate || r.return_date)})
ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, source=excluded.source, origin_name=excluded.origin_name, origin_id=excluded.origin_id, origin_country=excluded.origin_country, destination_name=excluded.destination_name, destination_id=excluded.destination_id, destination_country=excluded.destination_country, pickup_date=excluded.pickup_date, return_date=excluded.return_date WHERE user_routes.telegram_id=excluded.telegram_id;`);
      counts.routes++;
    }

    for (const alert of item.sent_alerts) {
      if (alert._id === 'undefined') continue;
      const fingerprint = required(alert._id ?? alert.fingerprint, 'sent alert fingerprint');
      if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error('Sent alert fingerprint must be a SHA-256 hash');
      if (!alert.sent_at || Number.isNaN(Date.parse(alert.sent_at))) throw new Error('sent_at is missing or invalid');
      const sentAt = sqlText(alert.sent_at);
      const summary = JSON.stringify({ source: alert.source || '', origin: alert.origin || '', destination: alert.destination || '', price: alert.price ?? null });
      statements.push(`INSERT INTO offers (fingerprint, source, is_active, found_at) VALUES (${sqlText(fingerprint)}, ${sqlText(alert.source || 'legacy')}, 0, ${sentAt}) ON CONFLICT(fingerprint) DO NOTHING;`);
      statements.push(`INSERT INTO sent_alerts (telegram_id, fingerprint, offer_summary, sent_at) VALUES (${sqlText(userId)}, ${sqlText(fingerprint)}, ${sqlText(summary)}, ${sentAt}) ON CONFLICT(telegram_id, fingerprint) DO NOTHING;`);
      counts.alerts++;
    }
  }

  return { sql: `${statements.join('\n\n')}\n`, counts };
}
