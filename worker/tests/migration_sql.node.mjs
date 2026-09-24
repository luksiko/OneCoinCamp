import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildMigrationSql } from '../scripts/migration_sql.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.resolve(directory, '../schema.sql'), 'utf8');
const fingerprint = 'a'.repeat(64);
const secondFingerprint = 'b'.repeat(64);
const snapshot = [{
  user: { _id: '42', chat_id: '42', status: 'active', language: 'ru' },
  filters: { price_max: 100 },
  routes: [{ _id: 'route-1', source: 'roadsurfer', origin_name: "L'Aquila" }],
  sent_alerts: [{ _id: fingerprint, sent_at: '2026-09-24T10:00:00Z', source: 'roadsurfer' }],
}];

test('reimport preserves existing alerts and child records', () => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON;');
  database.exec(schema);
  const { sql, counts } = buildMigrationSql(snapshot);
  assert.deepEqual(counts, { users: 1, filters: 1, routes: 1, alerts: 1 });
  database.exec(sql);
  database.exec(`INSERT INTO offers (fingerprint, source, is_active) VALUES ('${secondFingerprint}', 'roadsurfer', 0);`);
  database.exec(`INSERT INTO sent_alerts (telegram_id, fingerprint, sent_at) VALUES ('42', '${secondFingerprint}', '2026-09-24T12:00:00Z');`);
  database.exec(sql);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM user_routes').get().n, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM user_filters').get().n, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM sent_alerts').get().n, 2);
  assert.equal(database.prepare('SELECT is_active FROM offers WHERE fingerprint = ?').get(fingerprint).is_active, 0);
  database.close();
});

test('rejects a legacy export without sent alert history', () => {
  assert.throws(() => buildMigrationSql([{ user: { _id: '42' }, routes: [] }]), /sent_alerts arrays/);
});
