import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildMigrationSql } from './migration_sql.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultExportPath = path.resolve(scriptDir, '../../firestore_export.json');
let temporaryDirectory;

try {
  const args = process.argv.slice(2);
  let exportPath = defaultExportPath;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--export' && args[i + 1]) exportPath = path.resolve(args[++i]);
    else if (args[i] === '--apply') apply = true;
    else if (args[i] === '--help') {
      console.log('Usage: node scripts/migrate_firestore.js [--export path] [--apply]');
      process.exit(0);
    } else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }

  const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const { sql, counts } = buildMigrationSql(data);
  console.log(`Complete export: ${counts.users} users, ${counts.filters} filters, ${counts.routes} routes, ${counts.alerts} sent alerts.`);
  if (!apply) {
    console.log('Preview complete. Pass --apply to import into remote D1.');
  } else {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'camper-d1-import-'));
    const sqlPath = path.join(temporaryDirectory, 'migration.sql');
    fs.writeFileSync(sqlPath, sql, { mode: 0o600 });
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'camper_monitor_db', '--remote', '--file', sqlPath, '--yes'], {
      cwd: path.resolve(scriptDir, '..'),
      stdio: 'inherit',
    });
    console.log('D1 import completed.');
  }
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
