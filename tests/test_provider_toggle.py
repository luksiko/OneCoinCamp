import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from camper_monitor.config import Settings
from camper_monitor.models import Route
from camper_monitor.state import StateStore
from camper_monitor.main import poll_once

NODE_PROVIDER_TOGGLE_TEST_SCRIPT = """
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function setupGasContext(fetchMock, initialSettings = {}) {
  const scriptProps = {
    SPREADSHEET_ID: 'test-sheet-id',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
  };
  const memCache = {};
  const scriptTriggers = [];

  const defaultSettingsValues = [
    ['key', 'value'],
    ['poll_interval_minutes', 5],
    ['window_days', 14],
    ['timezone', 'Europe/Berlin'],
    ['telegram_enabled', false],
  ];
  Object.keys(initialSettings).forEach(k => {
    defaultSettingsValues.push([k, initialSettings[k]]);
  });

  const sheets = {
    'Settings': {
      values: defaultSettingsValues
    },
    'Filters': {
      values: [
        ['key', 'value'],
        ['allowed_origin_countries', 'DE,AT'],
        ['allowed_destination_countries', 'IT,ES'],
        ['window_days', 14],
      ]
    },
    'Routes': {
      values: [
        ['enabled', 'source', 'origin_name', 'origin_id', 'destination_name', 'destination_id', 'origin_country', 'destination_country'],
        [true, 'roadsurfer', 'Berlin', '6', 'Rome', '35', 'DE', 'IT'],
        [true, 'movacar', 'Berlin', '01JCR', 'Rome', '01JCD', 'DE', 'IT'],
      ]
    },
    'OffersArchive': {
      values: [
        ['found_at', 'source', 'offer_id', 'vehicle_id', 'vehicle', 'origin', 'origin_country', 'destination', 'destination_country', 'pickup_date', 'return_date', 'price', 'currency', 'booking_url', 'fingerprint', 'matches_filter', 'telegram_sent_at', 'raw_json'],
        ['2026-09-15', 'roadsurfer', 'rs-1', 'v1', 'VW', 'Berlin', 'DE', 'Rome', 'IT', '2026-10-20', '2026-10-25', '1', 'EUR', 'https://booking.roadsurfer.com/en/rally/pick?station=6&end_station=35', 'fp-rs-1', true, '', '{}'],
        ['2026-09-15', 'movacar', '01JCR->01JCD@1', 'v2', 'Fiat', 'Berlin', 'DE', 'Rome', 'IT', '2026-10-20', '2026-10-25', '1', 'EUR', 'https://movacar.com', 'fp-mv-1', true, '', '{}'],
      ]
    },
    'Runs': { values: [] },
  };

  const createSheetMock = (name) => {
    if (!sheets[name]) sheets[name] = { values: [] };
    const s = sheets[name];
    return {
      getLastRow: () => s.values.length,
      getLastColumn: () => (s.values[0] ? s.values[0].length : 18),
      deleteRow: (rowIndex) => {
        s.values.splice(rowIndex - 1, 1);
      },
      deleteRows: (rowIndex, numRows) => {
        s.values.splice(rowIndex - 1, numRows || 1);
      },
      getRange: (row, col, numRows, numCols) => ({
        getValues: () => {
          const nRows = numRows || 1;
          const nCols = numCols || 1;
          const result = [];
          for (let r = 0; r < nRows; r++) {
            const rowData = s.values[row - 1 + r] || [];
            const rowCells = [];
            for (let c = 0; c < nCols; c++) {
              rowCells.push(rowData[col - 1 + c] !== undefined ? rowData[col - 1 + c] : '');
            }
            result.push(rowCells);
          }
          return result;
        },
        setValues: (vals) => {
          for (let r = 0; r < vals.length; r++) {
            const targetRow = row - 1 + r;
            while (s.values.length <= targetRow) s.values.push([]);
            if (!s.values[targetRow]) s.values[targetRow] = [];
            for (let c = 0; c < vals[r].length; c++) {
              s.values[targetRow][col - 1 + c] = vals[r][c];
            }
          }
        },
        clearContent: () => {
          const nRows = numRows || 1;
          const nCols = numCols || 1;
          for (let r = 0; r < nRows; r++) {
            const rowIdx = row - 1 + r;
            if (s.values[rowIdx]) {
              for (let c = 0; c < nCols; c++) {
                s.values[rowIdx][col - 1 + c] = '';
              }
            }
          }
        }
      }),
      setFrozenRows: () => {}
    };
  };

  const mockSpreadsheet = {
    getId: () => 'test-sheet-id',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/test-sheet-id',
    getSheetByName: createSheetMock,
    insertSheet: (name) => createSheetMock(name),
  };

  const context = {
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    Set,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    Utilities: {
      sleep: () => {},
      getUuid: () => 'mock-uuid',
      formatDate: (d, tz, f) => {
        const date = (d instanceof Date) ? d : new Date(d);
        if (f === 'yyyy-MM-dd') {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return y + '-' + m + '-' + day;
        }
        return '2026-09-15T00:00:00';
      },
    },
    UrlFetchApp: {
      fetch: fetchMock
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => scriptProps[k] || '',
        setProperty: (k, v) => { scriptProps[k] = v; },
        deleteProperty: (k) => { delete scriptProps[k]; }
      })
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {}
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => memCache[k] || null,
        put: (k, v) => { memCache[k] = String(v); },
        remove: (k) => { delete memCache[k]; }
      })
    },
    Session: {
      getScriptTimeZone: () => 'Europe/Berlin'
    },
    SpreadsheetApp: {
      openById: () => mockSpreadsheet,
      getActiveSpreadsheet: () => mockSpreadsheet
    }
  };

  vm.createContext(context);
  const files = ['gas/Config.js', 'gas/Http.js', 'gas/I18n.js', 'gas/Filters.js', 'gas/Sheets.js', 'gas/Telegram.js', 'gas/Providers.js', 'gas/Monitor.js', 'gas/WebApp.js'];
  for (const f of files) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), context);
  }
  return { context, sheets, scriptProps, memCache };
}

const testName = process.argv.slice(1).find(arg => arg !== '[eval]' && !arg.endsWith('.js') && !arg.endsWith('node'));

if (testName === 'provider_toggle_helpers') {
  const { context } = setupGasContext(() => ({}));
  assert.strictEqual(context.isProviderEnabled_('roadsurfer', {}), true);
  assert.strictEqual(context.isProviderEnabled_('roadsurfer', { provider_roadsurfer_enabled: true }), true);
  assert.strictEqual(context.isProviderEnabled_('roadsurfer', { provider_roadsurfer_enabled: false }), false);
  assert.strictEqual(context.isProviderEnabled_('roadsurfer', { provider_roadsurfer_enabled: 'false' }), false);
  assert.strictEqual(context.isProviderEnabled_('roadsurfer', { provider_roadsurfer_enabled: '0' }), false);
  assert.strictEqual(context.isProviderEnabled_('movacar', { provider_movacar_enabled: false }), false);
  assert.strictEqual(context.isProviderEnabled_('indiecampers', { provider_indiecampers_enabled: true }), true);
  assert.strictEqual(context.isProviderEnabled_('imoova', { provider_imoova_enabled: false }), false);
} else if (testName === 'run_monitor_skips_disabled_provider') {
  const fetchedUrls = [];
  const fetchMock = (url) => {
    fetchedUrls.push(url);
    if (url.includes('/api/en/rally/stations/6')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: 6, returns: [35] }) };
    }
    if (url.includes('/api/en/rally/timeframes')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify([{ start: '2026-10-01', end: '2026-10-10' }]) };
    }
    if (url.includes('/api/en/rally/search')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify([{ id: 101, name: 'VW', price: 1, available: true }]) };
    }
    return { getResponseCode: () => 200, getContentText: () => '[]' };
  };

  // roadsurfer enabled, movacar disabled
  const { context } = setupGasContext(fetchMock, {
    provider_roadsurfer_enabled: true,
    provider_movacar_enabled: false,
  });

  context.runMonitorOnce();

  // Movacar URLs should NEVER have been called!
  const hasMovacar = fetchedUrls.some(u => u.includes('crowd-api') || u.includes('movacar'));
  assert.strictEqual(hasMovacar, false, 'Movacar was called despite being disabled in settings');

  // Roadsurfer was called
  const hasRoadsurfer = fetchedUrls.some(u => u.includes('roadsurfer'));
  assert.strictEqual(hasRoadsurfer, true, 'Roadsurfer should have been called');
} else if (testName === 'check_offers_availability_skips_disabled_provider') {
  const fetchedUrls = [];
  const fetchMock = (url) => {
    fetchedUrls.push(url);
    return { getResponseCode: () => 200, getContentText: () => '[]' };
  };

  // roadsurfer disabled, movacar enabled
  const { context } = setupGasContext(fetchMock, {
    provider_roadsurfer_enabled: false,
    provider_movacar_enabled: true,
  });

  context.checkOffersAvailability();

  // Roadsurfer search API should NOT be queried
  const hasRoadsurfer = fetchedUrls.some(u => u.includes('roadsurfer'));
  assert.strictEqual(hasRoadsurfer, false, 'Roadsurfer availability was queried despite being disabled');
} else if (testName === 'check_providers_health_skips_disabled_provider') {
  const fetchedUrls = [];
  const fetchMock = (url) => {
    fetchedUrls.push(url);
    return { getResponseCode: () => 200, getContentText: () => '{}' };
  };

  const { context, scriptProps } = setupGasContext(fetchMock, {
    provider_roadsurfer_enabled: false,
    provider_movacar_enabled: true,
    provider_indiecampers_enabled: false,
    provider_imoova_enabled: false,
  });
  scriptProps.WEBAPP_SKIP_AUTH = '1';

  const health = context.checkProvidersHealth('', true);

  assert.strictEqual(health.roadsurfer.disabled, true);
  assert.strictEqual(health.roadsurfer.message, 'Отключен в настройках');
  assert.strictEqual(health.indiecampers.disabled, true);
  assert.strictEqual(health.imoova.disabled, true);

  // Roadsurfer, Indiecampers, Imoova should not have been fetched
  assert.strictEqual(fetchedUrls.some(u => u.includes('roadsurfer')), false);
  assert.strictEqual(fetchedUrls.some(u => u.includes('indiecampers')), false);
  assert.strictEqual(fetchedUrls.some(u => u.includes('imoova')), false);
  // Movacar was enabled and attempted
  assert.strictEqual(fetchedUrls.some(u => u.includes('crowd-api')), true);
} else if (testName === 'webapp_ui_data_and_save_includes_providers') {
  const { context, scriptProps } = setupGasContext(() => ({}), {
    provider_roadsurfer_enabled: true,
    provider_movacar_enabled: false,
  });
  scriptProps.WEBAPP_SKIP_AUTH = '1';

  const uiData = context.getUiData('');
  assert.strictEqual(uiData.settings.provider_roadsurfer_enabled, true);
  assert.strictEqual(uiData.settings.provider_movacar_enabled, false);

  // Save new settings
  context.saveUiData({
    settings: {
      provider_roadsurfer_enabled: false,
      provider_movacar_enabled: true,
      provider_indiecampers_enabled: false,
      provider_imoova_enabled: true,
    }
  }, '');

  const updatedUiData = context.getUiData('');
  assert.strictEqual(updatedUiData.settings.provider_roadsurfer_enabled, false);
  assert.strictEqual(updatedUiData.settings.provider_movacar_enabled, true);
  assert.strictEqual(updatedUiData.settings.provider_indiecampers_enabled, false);
  assert.strictEqual(updatedUiData.settings.provider_imoova_enabled, true);
} else {
  throw new Error('Unknown test: ' + testName);
}
"""


def run_node_provider_test(test_name: str):
    res = subprocess.run(
        ["node", "-e", NODE_PROVIDER_TOGGLE_TEST_SCRIPT, test_name],
        capture_output=True,
        text=True,
        cwd=Path(__file__).resolve().parent.parent,
    )
    assert res.returncode == 0, f"Node test '{test_name}' failed: {res.stderr}"


@pytest.mark.parametrize(
    "test_name",
    [
        "provider_toggle_helpers",
        "run_monitor_skips_disabled_provider",
        "check_offers_availability_skips_disabled_provider",
        "check_providers_health_skips_disabled_provider",
        "webapp_ui_data_and_save_includes_providers",
    ],
)
def test_gas_provider_toggles(test_name: str):
    run_node_provider_test(test_name)


def test_python_monitor_skips_disabled_providers(tmp_path):
    db_file = tmp_path / "state.db"
    store = StateStore(db_file)
    route_rs = Route(
        source="roadsurfer",
        origin="Berlin",
        destination="Rome",
        origin_id=6,
        destination_id=35,
        pickup_date="2026-10-26",
        return_date="2026-11-02",
        enabled=True,
    )
    route_mv = Route(
        source="movacar",
        origin="Berlin",
        destination="Paris",
        origin_id="ber",
        destination_id="par",
        pickup_date="2026-10-26",
        return_date="2026-11-02",
        enabled=True,
    )

    # Only movacar is enabled
    settings = Settings(
        routes=(route_rs, route_mv),
        poll_interval_seconds=60,
        request_timeout_seconds=10,
        telegram_bot_token=None,
        telegram_chat_id=None,
        allowed_origin_countries=(),
        allowed_destination_countries=(),
        min_trip_days=None,
        max_trip_days=None,
        enabled_providers=("movacar",),
    )

    mock_client = MagicMock()
    mock_client.get.return_value = {
        "data": [{"id": "201", "type": "offer", "attributes": {"price": 1, "name": "Movacar Van"}}]
    }

    with patch("camper_monitor.main.JsonHttpClient", return_value=mock_client):
        found = poll_once(settings, store)

    assert found == 1
    # Only 1 poll run was registered (movacar), roadsurfer was skipped completely
    rows = store.connection.execute("SELECT source FROM poll_runs").fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "movacar"
