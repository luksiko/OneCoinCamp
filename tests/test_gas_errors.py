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
  const scriptTriggers = [];

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
    decodeURIComponent,
    parseInt,
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
      computeHmacSha256Signature: (value, key, charset) => {
        const crypto = require('crypto');
        const keyBuf = Buffer.isBuffer(key) ? key : (Array.isArray(key) ? Buffer.from(key.map(b => (b < 0 ? b + 256 : b))) : Buffer.from(String(key), 'utf8'));
        const valBuf = Buffer.isBuffer(value) ? value : (Array.isArray(value) ? Buffer.from(value.map(b => (b < 0 ? b + 256 : b))) : Buffer.from(String(value), 'utf8'));
        const hmac = crypto.createHmac('sha256', keyBuf);
        hmac.update(valBuf);
        const buf = hmac.digest();
        return Array.from(buf).map(b => (b > 127 ? b - 256 : b));
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
    ScriptApp: {
      getService: () => ({
        getUrl: () => 'https://script.google.com/macros/s/test-deployment/exec',
      }),
      getProjectTriggers: () => scriptTriggers.map(function (fn) {
        return { getHandlerFunction: () => fn };
      }),
      newTrigger: (fn) => ({
        timeBased: () => ({
          everyMinutes: (m) => ({
            create: () => { scriptTriggers.push(fn); }
          })
        })
      }),
      deleteTrigger: (trigger) => {
        const fn = trigger.getHandlerFunction();
        const idx = scriptTriggers.indexOf(fn);
        if (idx !== -1) scriptTriggers.splice(idx, 1);
      }
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
                  if (!s.values[targetRow]) s.values[targetRow] = [];
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
  const files = ['gas/Config.js', 'gas/Http.js', 'gas/Filters.js', 'gas/Sheets.js', 'gas/Telegram.js', 'gas/Providers.js', 'gas/Monitor.js', 'gas/WebApp.js'];
  for (const f of files) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), context);
  }
  return { context, sheets, scriptProps, memCache, scriptTriggers };
}

const testName = process.argv.slice(1).find(arg => arg !== '[eval]' && !arg.endsWith('.js') && !arg.endsWith('node'));

const TEST_ARCHIVE_HEADERS = [
  'found_at', 'source', 'offer_id', 'vehicle_id', 'vehicle', 'origin', 'origin_country',
  'destination', 'destination_country', 'pickup_date', 'return_date', 'price', 'currency',
  'booking_url', 'fingerprint', 'matches_filter', 'telegram_sent_at', 'raw_json'
];

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
} else if (testName === 'roadsurfer_station_returns_are_destinations') {
  const { context } = setupGasContext(() => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({ id: 6, returns: [16, 35] })
  }));
  const destinations = context.fetchRoadsurferDestinations_('6', {});
  assert.deepStrictEqual(destinations.map(d => d.id), [16, 35]);
} else if (testName === 'roadsurfer_rejects_city_as_station_id') {
  const { context } = setupGasContext(() => ({
    getResponseCode: () => 200,
    getContentText: () => '[]'
  }));
  assert.throws(() => {
    context.fetchRoadsurferOffers_(
      { source: 'roadsurfer', originId: 'Rome', destinationId: '35' },
      { start: new Date(), end: new Date() },
      {}
    );
  }, /numeric station ID/);
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
} else if (testName === 'webapp_signature_test_vector_1') {
  const { context, scriptProps } = setupGasContext(() => ({}));
  scriptProps.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  scriptProps.TELEGRAM_CHAT_ID = '123456789';
  const initData = 'auth_date=1710000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%2C%22last_name%22%3A%22Doe%22%2C%22username%22%3A%22johndoe%22%7D&hash=2f373971862e44d0e6259cbd3db6d4bc5b704d59af8019340c8f0e392cfe3413';
  const result = context.validateTelegramWebAppData_(initData, null, 1710000050);
  assert.strictEqual(result.user.id, 123456789);
  assert.strictEqual(result.user.username, 'johndoe');
  assert.strictEqual(result.authDate, 1710000000);
} else if (testName === 'webapp_signature_test_vector_2') {
  const { context, scriptProps } = setupGasContext(() => ({}));
  scriptProps.TELEGRAM_BOT_TOKEN = '987654:XYZ-UVW9876abCde-rst12A3b4c567de89';
  scriptProps.TELEGRAM_ALLOWED_USERS = 'alice_tg';
  const initData = 'auth_date=1725000000&chat_instance=8472947291823749&chat_type=sender&user=%7B%22id%22%3A99887766%2C%22first_name%22%3A%22Alice%22%2C%22username%22%3A%22alice_tg%22%7D&hash=8f56a2e32ad57eef3860b18292c9d4051f9bca8311fb0b0a3346aeb58159845a';
  const result = context.validateTelegramWebAppData_(initData, null, 1725000050);
  assert.strictEqual(result.user.id, 99887766);
  assert.strictEqual(result.user.username, 'alice_tg');
} else if (testName === 'webapp_missing_init_data') {
  const { context, scriptProps } = setupGasContext(() => ({}));
  scriptProps.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  scriptProps.TELEGRAM_CHAT_ID = '123456789';
  scriptProps.WEB_APP_REQUIRE_TELEGRAM_AUTH = 'true';
  assert.throws(() => {
    context.getUiData();
  }, /Missing Telegram WebApp initData/);
  assert.throws(() => {
    context.saveUiData({ settings: { poll_interval_minutes: 10 } });
  }, /Missing Telegram WebApp initData/);
  assert.throws(() => {
    context.runMonitorFromUi();
  }, /Missing Telegram WebApp initData/);
  assert.throws(() => {
    context.checkProvidersHealth();
  }, /Missing Telegram WebApp initData/);
} else if (testName === 'webapp_development_mode_allows_direct_access') {
  const { context, scriptProps } = setupGasContext(() => ({}));
  scriptProps.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  scriptProps.TELEGRAM_CHAT_ID = '123456789';
  const uiData = context.getUiData('');
  assert.strictEqual(uiData.settings.poll_interval_minutes, 5);
} else if (testName === 'webapp_skip_auth_property_bypasses_gate') {
  const { context, scriptProps } = setupGasContext(() => ({}));
  scriptProps.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  scriptProps.TELEGRAM_CHAT_ID = '123456789';
  scriptProps.WEB_APP_REQUIRE_TELEGRAM_AUTH = 'true';
  scriptProps.WEBAPP_SKIP_AUTH = '1';
  const uiData = context.getUiData('');
  assert.strictEqual(uiData.settings.poll_interval_minutes, 5);
  assert.strictEqual(uiData.offersTabEnabled, true);
  const skipped = context.authorizeWebAppRequest_('', context.getScriptSecrets());
  assert.strictEqual(skipped.authenticated, true);
  assert.strictEqual(skipped.user.username, 'dev_user');
} else if (testName === 'webapp_status_serializes_dates') {
  const { context, sheets } = setupGasContext(() => ({}));
  sheets['Runs'].values = [
    ['started_at', 'finished_at', 'source', 'request_count', 'offers_found', 'archived', 'alerts_sent', 'status', 'error'],
    [new Date('2026-09-15T10:00:00.000Z'), new Date('2026-09-15T10:01:00.000Z'), 'all', 2, 1, 1, 1, 'OK', ''],
  ];
  const status = context.buildStatus_(context.SpreadsheetApp.openById('test-sheet-id'), { poll_interval_minutes: 5 });
  assert.strictEqual(status.lastRun.started_at, '2026-09-15T10:00:00.000Z');
  assert.strictEqual(status.lastRun.finished_at, '2026-09-15T10:01:00.000Z');
  assert.strictEqual(typeof status.lastRun.started_at, 'string');
} else if (testName === 'telegram_mini_app_menu') {
  let request = null;
  const { context, scriptProps } = setupGasContext((url, options) => {
    request = { url: url, options: options };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: true }) };
  });
  scriptProps.TELEGRAM_BOT_TOKEN = 'bot-token';
  const result = context.setupTelegramMiniApp();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.webAppUrl, 'https://script.google.com/macros/s/test-deployment/exec');
  assert.ok(request.url.endsWith('/setChatMenuButton'));
  const payload = JSON.parse(request.options.payload);
  assert.strictEqual(payload.menu_button.type, 'web_app');
  assert.strictEqual(payload.menu_button.web_app.url, result.webAppUrl);
} else if (testName === 'webapp_invalid_signature') {
  const { context, scriptProps } = setupGasContext(() => ({}));
  scriptProps.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  scriptProps.TELEGRAM_CHAT_ID = '123456789';
  context.Date.now = () => 1710000050 * 1000;
  const tampered = 'auth_date=1710000000&query_id=TAMPERED&user=%7B%22id%22%3A123456789%7D&hash=2f373971862e44d0e6259cbd3db6d4bc5b704d59af8019340c8f0e392cfe3413';
  assert.throws(() => {
    context.getUiData(tampered);
  }, /Invalid Telegram WebApp initData signature/);
} else if (testName === 'webapp_expired_auth_date') {
  const { context, scriptProps } = setupGasContext(() => ({}));
  scriptProps.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  scriptProps.TELEGRAM_CHAT_ID = '123456789';
  const initData = 'auth_date=1710000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%2C%22last_name%22%3A%22Doe%22%2C%22username%22%3A%22johndoe%22%7D&hash=2f373971862e44d0e6259cbd3db6d4bc5b704d59af8019340c8f0e392cfe3413';
  assert.throws(() => {
    context.validateTelegramWebAppData_(initData, null, 1710000000 + 86401);
  }, /Telegram WebApp initData expired/);
} else if (testName === 'webapp_unauthorized_user') {
  const { context, scriptProps } = setupGasContext(() => ({}));
  scriptProps.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  scriptProps.TELEGRAM_CHAT_ID = '999999999';
  const initData = 'auth_date=1710000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%2C%22last_name%22%3A%22Doe%22%2C%22username%22%3A%22johndoe%22%7D&hash=2f373971862e44d0e6259cbd3db6d4bc5b704d59af8019340c8f0e392cfe3413';
  assert.throws(() => {
    context.validateTelegramWebAppData_(initData, null, 1710000050);
  }, /Access denied: Unauthorized Telegram user or chat/);
} else if (testName === 'webapp_authorized_operations') {
  const { context, scriptProps, sheets } = setupGasContext((url) => {
    if (url.includes('stations')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ data: [{ id: 6 }] }) };
    }
    if (url.includes('locations/popular')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ data: [{ id: '1' }] }) };
    }
    if (url.includes('getMe')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: { username: 'test_bot' } }) };
    }
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) };
  });
  scriptProps.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  scriptProps.TELEGRAM_CHAT_ID = '123456789';
  const initData = 'auth_date=1710000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%2C%22last_name%22%3A%22Doe%22%2C%22username%22%3A%22johndoe%22%7D&hash=2f373971862e44d0e6259cbd3db6d4bc5b704d59af8019340c8f0e392cfe3413';

  // Override Date.now for expiration checks during UI calls
  const origNow = context.Date.now;
  context.Date.now = () => 1710000050 * 1000;

  const uiData = context.getUiData(initData);
  assert.strictEqual(uiData.settings.poll_interval_minutes, 5);
  assert.strictEqual(uiData.telegramReady, true);

  const health = context.checkProvidersHealth(initData);
  assert.strictEqual(health.roadsurfer.ok, true);
  assert.strictEqual(health.movacar.ok, true);
  assert.strictEqual(health.telegram.ok, true);

  const saveRes = context.saveUiData({ settings: { poll_interval_minutes: 15 } }, initData);
  assert.strictEqual(saveRes.settings.poll_interval_minutes, 15);

  context.runMonitorFromUi(initData);
  const runs = sheets['Runs'].values;
  assert.strictEqual(runs.length, 2);

  context.Date.now = origNow;
} else if (testName === 'freshness_repairs_missing_monitor_trigger') {
  const { context, sheets, scriptTriggers, scriptProps } = setupGasContext((url) => {
    if (url.includes('stations/6')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ routes: [] }) };
    }
    if (url.includes('rally/search')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify([]) };
    }
    if (url.includes('api.telegram.org')) {
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: { message_id: 1 } }) };
    }
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ included: [] }) };
  });

  // Stale run: finished 3h ago (threshold with poll_interval 5 => 10 min)
  const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000).toISOString();
  sheets['Runs'].values = [
    ['started_at', 'finished_at', 'source', 'request_count', 'offers_found', 'archived', 'alerts_sent', 'status', 'error'],
    [threeHoursAgo, threeHoursAgo, 'all', 2, 0, 0, 0, 'OK', ''],
  ];
  sheets['Settings'].values = [
    ['key', 'value'],
    ['poll_interval_minutes', 5],
    ['window_days', 14],
    ['timezone', 'Europe/Berlin'],
    ['telegram_enabled', false],
  ];
  sheets['Routes'].values = [
    ['enabled', 'source', 'origin_name', 'origin_id', 'destination_name', 'destination_id', 'origin_country', 'destination_country'],
    [true, 'roadsurfer', 'Berlin', '6', 'Rome', '35', 'DE', 'IT'],
    [false, 'movacar', 'Berlin', '01JCR', 'Rome', '01JCD', 'DE', 'IT'],
  ];

  // No monitor trigger installed (simulating the deployed-loss scenario)
  scriptTriggers.splice(0, scriptTriggers.length);

  const freshness = context.checkMonitorFreshness();
  assert.strictEqual(freshness.isStale, true);
  assert.ok(scriptTriggers.indexOf('runMonitorOnce') !== -1, 'runMonitorOnce trigger must be recreated');
  assert.ok(scriptTriggers.indexOf('processTelegramUpdates') !== -1, 'processTelegramUpdates trigger must be recreated');
  // A manual run was kicked off as part of self-heal
  assert.ok(sheets['Runs'].values.length >= 3, 'manual run should append a run row');
  // INSTALLED_AT refreshed
  assert.ok(scriptProps.MONITOR_FRESHNESS_INSTALLED_AT, 'INSTALLED_AT should be refreshed');
} else if (testName === 'freshness_no_repair_when_fresh') {
  const { context, sheets, scriptTriggers } = setupGasContext((url) => {
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ included: [] }) };
  });
  const now = new Date().toISOString();
  sheets['Runs'].values = [
    ['started_at', 'finished_at', 'source', 'request_count', 'offers_found', 'archived', 'alerts_sent', 'status', 'error'],
    [now, now, 'all', 2, 0, 0, 0, 'OK', ''],
  ];
  sheets['Settings'].values = [
    ['key', 'value'],
    ['poll_interval_minutes', 5],
    ['window_days', 14],
    ['timezone', 'Europe/Berlin'],
    ['telegram_enabled', false],
  ];
  scriptTriggers.splice(0, scriptTriggers.length);

  const freshness = context.checkMonitorFreshness();
  assert.strictEqual(freshness.isStale, false);
  // No repair needed => no runMonitorOnce was (re)installed, no forced run appended
  assert.strictEqual(scriptTriggers.indexOf('runMonitorOnce'), -1);
  assert.strictEqual(sheets['Runs'].values.length, 2);
} else if (testName === 'monitor_logs_error_run_when_setup_fails') {
  const { context, sheets } = setupGasContext((url) => {
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ included: [] }) };
  });
  // Ensure the workbook opens fine but a later setup step crashes (as happens if a
  // config sheet is corrupted). runMonitorOnce must still record an ERROR run row.
  context.buildDateWindow_ = () => { throw new Error('broken date window'); };
  context.runMonitorOnce();
  const runs = sheets['Runs'].values;
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[1][7], 'ERROR');
  assert.match(runs[1][8], /broken date window/);
} else if (testName === 'roadsurfer_get_destinations_filters_valid_pairs') {
  const { context, scriptProps } = setupGasContext((url) => {
    if (url.endsWith('/stations')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify([
          { id: 6, name: 'Berlin', city: { name: 'Berlin', country: 'DE' }, enabled: true },
          { id: 16, name: 'Aix-Marseille', city: { name: 'Cabriès', country: 'FR' }, enabled: true },
          { id: 35, name: 'Rome Fiumicino Airport', city: { name: 'Rome', country: 'IT' }, enabled: true },
          { id: 40, name: 'Madrid', city: { name: 'Madrid', country: 'ES' }, enabled: true },
        ])
      };
    }
    if (url.includes('/stations/6')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ id: 6, returns: [16, 35] })
      };
    }
    return { getResponseCode: () => 200, getContentText: () => '[]' };
  });

  scriptProps.WEBAPP_SKIP_AUTH = 'true';

  // 1. All valid destinations for origin 6 (Berlin)
  const allDestinations = context.getRoadsurferDestinations('6', [], '');
  assert.strictEqual(allDestinations.length, 2);
  assert.deepStrictEqual(allDestinations.map(d => d.id), ['16', '35']);
  assert.deepStrictEqual(allDestinations.map(d => d.country), ['FR', 'IT']);

  // 2. Filtered by Italy ('IT')
  const itDestinations = context.getRoadsurferDestinations('6', ['IT'], '');
  assert.strictEqual(itDestinations.length, 1);
  assert.strictEqual(itDestinations[0].id, '35');
  assert.strictEqual(itDestinations[0].name, 'Rome Fiumicino Airport');

  // 3. Filtered by Spain ('ES') -> Berlin has NO returns in Spain
  const esDestinations = context.getRoadsurferDestinations('6', ['ES'], '');
  assert.strictEqual(esDestinations.length, 0);

  // 4. Empty or missing originId returns empty list
  assert.strictEqual(context.getRoadsurferDestinations('', [], '').length, 0);
} else if (testName === 'webapp_delete_offer_removes_row_and_marks_dismissed') {
  const { context, sheets, scriptProps } = setupGasContext(() => ({ getResponseCode: () => 200, getContentText: () => '{}' }));
  scriptProps.WEBAPP_SKIP_AUTH = '1';
  sheets.OffersArchive.values = [
    TEST_ARCHIVE_HEADERS,
    ['2026-09-15T00:00:00', 'roadsurfer', '101', 'v1', 'Camper', 'Berlin', 'DE', 'Rome', 'IT', '2026-10-01', '2026-10-08', 100, 'EUR', 'https://example.com', 'fp_to_delete', true, '', ''],
    ['2026-09-15T00:00:00', 'roadsurfer', '102', 'v2', 'Camper', 'Berlin', 'DE', 'Rome', 'IT', '2026-10-01', '2026-10-08', 100, 'EUR', 'https://example.com', 'fp_to_keep', true, '', '']
  ];

  const res = context.deleteOffer('fp_to_delete', '');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.deleted, true);
  assert.strictEqual(sheets.OffersArchive.values.length, 2);
  assert.strictEqual(sheets.OffersArchive.values[1][14], 'fp_to_keep');
  assert.strictEqual(context.isFingerprintDismissed_('fp_to_delete'), true);
  assert.strictEqual(context.isFingerprintDismissed_('fp_to_keep'), false);
} else if (testName === 'check_offers_availability_removes_expired_and_missing_offers') {
  const fetchMock = (url) => {
    if (url.includes('rally/search')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify([{ id: 102, offer_id: '102', price: 100 }])
      };
    }
    if (url.includes('locations/offers')) {
      if (url.includes('origin_reference=berlin') && url.includes('destination_reference=rome')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            included: [{ type: 'locationsummary', id: 'rome', attributes: { offer_count: 0 } }]
          })
        };
      }
      if (url.includes('origin_reference=berlin') && url.includes('destination_reference=paris')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            included: [{ type: 'locationsummary', id: 'paris', attributes: { offer_count: 2 } }]
          })
        };
      }
    }
    return { getResponseCode: () => 200, getContentText: () => '{}' };
  };

  const { context, sheets } = setupGasContext(fetchMock);
  sheets.OffersArchive.values = [
    TEST_ARCHIVE_HEADERS,
    ['2026-09-10T00:00:00', 'roadsurfer', '99', 'v99', 'Camper', 'Berlin', 'DE', 'Rome', 'IT', '2026-09-01', '2026-09-05', 50, 'EUR', 'https://booking.roadsurfer.com/en/rally/pick?station=6&end_station=35', 'fp_expired', true, '', ''],
    ['2026-09-15T00:00:00', 'roadsurfer', '101', 'v1', 'Camper', 'Berlin', 'DE', 'Rome', 'IT', '2026-10-01', '2026-10-08', 100, 'EUR', 'https://booking.roadsurfer.com/en/rally/pick?station=6&end_station=35', 'fp_rs_missing', true, '', ''],
    ['2026-09-15T00:00:00', 'roadsurfer', '102', 'v2', 'Camper', 'Berlin', 'DE', 'Rome', 'IT', '2026-10-01', '2026-10-08', 100, 'EUR', 'https://booking.roadsurfer.com/en/rally/pick?station=6&end_station=35', 'fp_rs_active', true, '', ''],
    ['2026-09-15T00:00:00', 'movacar', 'berlin->rome@2026-10-01', '', 'Car', 'Berlin', 'DE', 'Rome', 'IT', '2026-10-01', '2026-10-08', 1, 'EUR', 'https://movacar.com/', 'fp_mv_soldout', true, '', ''],
    ['2026-09-15T00:00:00', 'movacar', 'berlin->paris@2026-10-01', '', 'Car', 'Berlin', 'DE', 'Paris', 'FR', '2026-10-01', '2026-10-08', 1, 'EUR', 'https://movacar.com/', 'fp_mv_active', true, '', '']
  ];

  const result = context.checkOffersAvailability();
  assert.strictEqual(result.checked, 5);
  assert.strictEqual(result.removed, 3);
  assert.strictEqual(sheets.OffersArchive.values.length, 3);
  const remainingFps = sheets.OffersArchive.values.slice(1).map(r => r[14]);
  assert.deepStrictEqual(remainingFps, ['fp_rs_active', 'fp_mv_active']);
} else if (testName === 'check_offers_availability_retains_offers_on_network_error') {
  const fetchMock = () => {
    throw new Error('Internal Server Error 500');
  };

  const { context, sheets } = setupGasContext(fetchMock);
  sheets.OffersArchive.values = [
    TEST_ARCHIVE_HEADERS,
    ['2026-09-15T00:00:00', 'roadsurfer', '101', 'v1', 'Camper', 'Berlin', 'DE', 'Rome', 'IT', '2026-10-01', '2026-10-08', 100, 'EUR', 'https://booking.roadsurfer.com/en/rally/pick?station=6&end_station=35', 'fp_safe', true, '', '']
  ];

  const result = context.checkOffersAvailability();
  assert.strictEqual(result.checked, 1);
  assert.strictEqual(result.removed, 0);
  assert.strictEqual(sheets.OffersArchive.values.length, 2);
  assert.strictEqual(sheets.OffersArchive.values[1][14], 'fp_safe');
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
        "roadsurfer_station_returns_are_destinations",
        "roadsurfer_rejects_city_as_station_id",
        "movacar_429",
        "movacar_500",
        "movacar_invalid_json",
        "roadsurfer_offers_500",
        "monitor_logs_error_and_does_not_overwrite_ok",
        "monitor_logs_ok_when_successful",
        "telegram_temporary_failure_and_retry",
        "telegram_failed_existing_archive_retry",
        "webapp_signature_test_vector_1",
        "webapp_signature_test_vector_2",
        "webapp_missing_init_data",
        "webapp_development_mode_allows_direct_access",
        "webapp_skip_auth_property_bypasses_gate",
        "webapp_status_serializes_dates",
        "telegram_mini_app_menu",
        "webapp_invalid_signature",
        "webapp_expired_auth_date",
        "webapp_unauthorized_user",
        "webapp_authorized_operations",
        "freshness_repairs_missing_monitor_trigger",
        "freshness_no_repair_when_fresh",
        "monitor_logs_error_run_when_setup_fails",
        "roadsurfer_get_destinations_filters_valid_pairs",
        "webapp_delete_offer_removes_row_and_marks_dismissed",
        "check_offers_availability_removes_expired_and_missing_offers",
        "check_offers_availability_retains_offers_on_network_error",
    ],
)
def test_gas_node_suite(test_name: str):
    run_node_test(test_name)
