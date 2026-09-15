import json
import subprocess
from pathlib import Path
import pytest

NODE_TEST_SCRIPT = """
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function setupGasContext(fetchMock) {
  const loggedRuns = [];
  const scriptProps = {
    SPREADSHEET_ID: 'test-sheet-id',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
  };
  const memCache = {};

  const sheets = {
    'Settings': {
      values: [
        ['key', 'value'],
        ['poll_interval_minutes', 5],
        ['window_days', 14],
        ['timezone', 'Europe/Berlin'],
        ['telegram_enabled', false],
      ]
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
    'OffersArchive': { values: [] },
    'Runs': { values: [] },
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
    encodeURIComponent,
    loggedRuns,
    Utilities: {
      sleep: () => {},
      getUuid: () => 'mock-uuid',
      formatDate: (d, tz, f) => '2026-09-15T00:00:00',
      DigestAlgorithm: { SHA_256: 1 },
      Charset: { UTF_8: 1 },
      computeDigest: (algo, str, charset) => {
        const crypto = require('crypto');
        const buf = crypto.createHash('sha256').update(String(str), 'utf8').digest();
        return Array.from(buf);
      },
    },
    UrlFetchApp: {
      fetch: fetchMock
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => scriptProps[k] || '',
        setProperty: (k, v) => { scriptProps[k] = v; }
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
        put: (k, v) => { memCache[k] = v; }
      })
    },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) => {
          if (!sheets[name]) sheets[name] = { values: [] };
          const s = sheets[name];
          return {
            getLastRow: () => s.values.length,
            getLastColumn: () => (s.values[0] ? s.values[0].length : 0),
            getRange: (row, col, numRows, numCols) => ({
              getValues: () => {
                const nRows = numRows || 1;
                const nCols = numCols || 1;
                const result = [];
                for (let r = 0; r < nRows; r++) {
                  const rowData = s.values[row - 1 + r] || [];
                  const rowCells = [];
                  for (let c = 0; c < nCols; c++) {
                    const val = rowData[col - 1 + c];
                    rowCells.push(val !== undefined ? val : '');
                  }
                  result.push(rowCells);
                }
                return result;
              },
              setValues: (vals) => {
                for (let r = 0; r < vals.length; r++) {
                  const targetRow = row - 1 + r;
                  while (s.values.length <= targetRow) s.values.push([]);
                  for (let c = 0; c < vals[r].length; c++) {
                    s.values[targetRow][col - 1 + c] = vals[r][c];
                  }
                }
              },
              clearContent: () => {}
            }),
            setFrozenRows: () => {}
          };
        }
      })
    }
  };

  vm.createContext(context);
  const files = ['gas/Config.js', 'gas/Http.js', 'gas/Filters.js', 'gas/Sheets.js', 'gas/Telegram.js', 'gas/Providers.js', 'gas/Monitor.js'];
  for (const f of files) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), context);
  }
  return { context, sheets, scriptProps, memCache };
}

const testName = process.argv.slice(1).find(arg => arg !== '[eval]' && !arg.endsWith('.js') && !arg.endsWith('node'));

if (testName === 'roadsurfer_429') {
  const { context } = setupGasContext(() => ({
    getResponseCode: () => 429,
    getContentText: () => 'Too Many Requests'
  }));
  assert.throws(() => {
    context.fetchRoadsurferDestinations_('6', {});
  }, /HTTP 429/);
} else if (testName === 'roadsurfer_500') {
  const { context } = setupGasContext(() => ({
    getResponseCode: () => 500,
    getContentText: () => 'Internal Server Error'
  }));
  assert.throws(() => {
    context.fetchRoadsurferDestinations_('6', {});
  }, /HTTP 500/);
} else if (testName === 'roadsurfer_invalid_json') {
  const { context } = setupGasContext(() => ({
    getResponseCode: () => 200,
    getContentText: () => '<html>Bad Gateway</html>'
  }));
  assert.throws(() => {
    context.fetchRoadsurferDestinations_('6', {});
  }, /Invalid JSON/);
} else if (testName === 'movacar_429') {
  const { context } = setupGasContext(() => ({
    getResponseCode: () => 429,
    getContentText: () => 'Rate limit exceeded'
  }));
  assert.throws(() => {
    context.fetchMovacarOffers_({ source: 'movacar', originId: '01A', destinationId: '01B' }, { start: new Date(), end: new Date() });
  }, /HTTP 429/);
} else if (testName === 'movacar_500') {
  const { context } = setupGasContext(() => ({
    getResponseCode: () => 500,
    getContentText: () => 'Internal Error'
  }));
  assert.throws(() => {
    context.fetchMovacarOffers_({ source: 'movacar', originId: '01A', destinationId: '01B' }, { start: new Date(), end: new Date() });
  }, /HTTP 500/);
} else if (testName === 'movacar_invalid_json') {
  const { context } = setupGasContext(() => ({
    getResponseCode: () => 200,
    getContentText: () => '<html>Not JSON</html>'
  }));
  assert.throws(() => {
    context.fetchMovacarOffers_({ source: 'movacar', originId: '01A', destinationId: '01B' }, { start: new Date(), end: new Date() });
  }, /Invalid JSON/);
} else if (testName === 'roadsurfer_offers_500') {
  const { context } = setupGasContext((url) => {
    if (url.includes('stations/6')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ routes: [{ id: 35, country: 'IT' }] })
      };
    }
    return {
      getResponseCode: () => 500,
      getContentText: () => 'Search failed'
    };
  });
  assert.throws(() => {
    context.fetchRoadsurferOffers_({ source: 'roadsurfer', originId: '6' }, { start: new Date(), end: new Date() }, {});
  }, /HTTP 500/);
} else if (testName === 'monitor_logs_error_and_does_not_overwrite_ok') {
  const { context, sheets } = setupGasContext((url) => {
    if (url.includes('booking.roadsurfer.com')) {
      return { getResponseCode: () => 429, getContentText: () => 'Rate limit' };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ included: [] })
    };
  });
  context.runMonitorOnce();
  const runs = sheets['Runs'].values;
  // Header row + 1 error row for roadsurfer
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[1][2], 'roadsurfer');
  assert.strictEqual(runs[1][7], 'ERROR');
  assert.match(runs[1][8], /HTTP 429/);
  // Must NOT contain an 'OK' row
  const hasOk = runs.some(r => r[7] === 'OK');
  assert.strictEqual(hasOk, false);
} else if (testName === 'monitor_logs_ok_when_successful') {
  const { context, sheets } = setupGasContext((url) => {
    if (url.includes('stations/6')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ routes: [{ id: 35, country: 'IT' }] })
      };
    }
    if (url.includes('rally/search')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify([])
      };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ included: [] })
    };
  });
  context.runMonitorOnce();
  const runs = sheets['Runs'].values;
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[1][2], 'all');
  assert.strictEqual(runs[1][7], 'OK');
} else if (testName === 'telegram_temporary_failure_and_retry') {
  let telegramFail = true;
  let telegramCallCount = 0;
  const { context, sheets, scriptProps, memCache } = setupGasContext((url) => {
    if (url.includes('stations/6')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ routes: [{ id: 35, country: 'IT' }] })
      };
    }
    if (url.includes('rally/search')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify([
          {
            id: 101,
            vehicle_model_id: 1,
            rental_days: 5,
            time_slot: { from: '2026-10-26T10:00:00', to: '2026-10-31T10:00:00' },
            pickup_station_id: 6,
            dropoff_station_id: 35,
            price: 1,
            currency: 'EUR'
          }
        ])
      };
    }
    if (url.includes('api.telegram.org')) {
      telegramCallCount++;
      if (telegramFail) {
        return {
          getResponseCode: () => 500,
          getContentText: () => JSON.stringify({ ok: false, description: 'Internal Server Error' })
        };
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ ok: true, result: { message_id: 123 } })
      };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ included: [] })
    };
  });

  sheets['Settings'].values = [
    ['key', 'value'],
    ['poll_interval_minutes', 5],
    ['window_days', 14],
    ['timezone', 'Europe/Berlin'],
    ['telegram_enabled', true],
  ];
  sheets['Routes'].values = [
    ['enabled', 'source', 'origin_name', 'origin_id', 'destination_name', 'destination_id', 'origin_country', 'destination_country'],
    [true, 'roadsurfer', 'Berlin', '6', 'Rome', '35', 'DE', 'IT'],
    [false, 'movacar', 'Berlin', '01JCR', 'Rome', '01JCD', 'DE', 'IT'],
  ];
  scriptProps.TELEGRAM_BOT_TOKEN = 'mock-bot-token';
  scriptProps.TELEGRAM_CHAT_ID = 'mock-chat-id';

  context.runMonitorOnce();
  const archive1 = sheets['OffersArchive'].values;
  assert.strictEqual(archive1.length, 1);
  assert.strictEqual(Object.keys(memCache).length, 0);
  assert.strictEqual(telegramCallCount, 2);
  const runs1 = sheets['Runs'].values;
  assert.strictEqual(runs1.length, 2);
  assert.strictEqual(runs1[1][6], 0);

  telegramFail = false;
  telegramCallCount = 0;
  context.runMonitorOnce();
  const archive2 = sheets['OffersArchive'].values;
  assert.strictEqual(archive2.length, 2);
  assert.strictEqual(archive2[1][16], '2026-09-15');
  assert.strictEqual(telegramCallCount, 1);
  const fp = archive2[1][14];
  assert.strictEqual(memCache[fp], '1');
  const runs2 = sheets['Runs'].values;
  assert.strictEqual(runs2.length, 3);
  assert.strictEqual(runs2[2][6], 1);

  telegramCallCount = 0;
  context.runMonitorOnce();
  const archive3 = sheets['OffersArchive'].values;
  assert.strictEqual(archive3.length, 2);
  assert.strictEqual(telegramCallCount, 0);
  const runs3 = sheets['Runs'].values;
  assert.strictEqual(runs3.length, 4);
  assert.strictEqual(runs3[3][6], 0);
} else if (testName === 'telegram_failed_existing_archive_retry') {
  let telegramCallCount = 0;
  const { context, sheets, scriptProps } = setupGasContext((url) => {
    if (url.includes('stations/6')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ routes: [{ id: 35, country: 'IT' }] })
      };
    }
    if (url.includes('rally/search')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify([
          {
            id: 101,
            vehicle_model_id: 1,
            rental_days: 5,
            time_slot: { from: '2026-10-26T10:00:00', to: '2026-10-31T10:00:00' },
            pickup_station_id: 6,
            dropoff_station_id: 35,
            price: 1,
            currency: 'EUR'
          }
        ])
      };
    }
    if (url.includes('api.telegram.org')) {
      telegramCallCount++;
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ ok: true, result: { message_id: 123 } })
      };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ included: [] })
    };
  });

  sheets['Settings'].values = [
    ['key', 'value'],
    ['poll_interval_minutes', 5],
    ['window_days', 14],
    ['timezone', 'Europe/Berlin'],
    ['telegram_enabled', true],
  ];
  sheets['Routes'].values = [
    ['enabled', 'source', 'origin_name', 'origin_id', 'destination_name', 'destination_id', 'origin_country', 'destination_country'],
    [true, 'roadsurfer', 'Berlin', '6', 'Rome', '35', 'DE', 'IT'],
    [false, 'movacar', 'Berlin', '01JCR', 'Rome', '01JCD', 'DE', 'IT'],
  ];
  scriptProps.TELEGRAM_BOT_TOKEN = 'mock-bot-token';
  scriptProps.TELEGRAM_CHAT_ID = 'mock-chat-id';

  const testOffer = {
    source: 'roadsurfer',
    originId: '6',
    destinationId: '35',
    offerId: '101',
    pickupDate: '2026-10-26',
    returnDate: '2026-10-31',
  };
  const actualFp = context.offerFingerprint_(testOffer);
  const oldRow = new Array(18).fill('');
  oldRow[14] = actualFp;
  oldRow[16] = 'FAILED: HTTP 500';
  sheets['OffersArchive'].values = [
    ['found_at', 'source', 'offer_id', 'vehicle_id', 'vehicle', 'origin', 'origin_country', 'destination', 'destination_country', 'pickup_date', 'return_date', 'price', 'currency', 'booking_url', 'fingerprint', 'matches_filter', 'telegram_sent_at', 'raw_json'],
    oldRow
  ];

  context.runMonitorOnce();
  assert.strictEqual(telegramCallCount, 1);
  const archive = sheets['OffersArchive'].values;
  assert.strictEqual(archive.length, 3);
  assert.strictEqual(archive[2][16], '2026-09-15');
} else {
  throw new Error('Unknown test: ' + testName);
}
"""


def run_node_test(test_name: str):
    res = subprocess.run(
        ["node", "-e", NODE_TEST_SCRIPT, test_name],
        capture_output=True,
        text=True,
        cwd=Path(__file__).resolve().parent.parent,
    )
    assert res.returncode == 0, f"Node test '{test_name}' failed: {res.stderr}"


@pytest.mark.parametrize(
    "test_name",
    [
        "roadsurfer_429",
        "roadsurfer_500",
        "roadsurfer_invalid_json",
        "movacar_429",
        "movacar_500",
        "movacar_invalid_json",
        "roadsurfer_offers_500",
        "monitor_logs_error_and_does_not_overwrite_ok",
        "monitor_logs_ok_when_successful",
        "telegram_temporary_failure_and_retry",
        "telegram_failed_existing_archive_retry",
    ],
)
def test_gas_error_handling(test_name):
    run_node_test(test_name)
