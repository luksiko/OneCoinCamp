function ensureWorkbook_() {
  const spreadsheet = getSpreadsheet();
  ensureSheet_(spreadsheet, SHEET_NAMES.SETTINGS, ['key', 'value'], objectToRows_(DEFAULT_SETTINGS));
  ensureSheet_(spreadsheet, SHEET_NAMES.FILTERS, ['key', 'value'], objectToRows_(DEFAULT_FILTERS));
  ensureSheet_(
    spreadsheet,
    SHEET_NAMES.ROUTES,
    [
      'enabled',
      'source',
      'origin_name',
      'origin_id',
      'destination_name',
      'destination_id',
      'origin_country',
      'destination_country',
    ],
    DEFAULT_ROUTES.map(routeToRow_)
  );
  ensureSheet_(spreadsheet, SHEET_NAMES.ARCHIVE, ARCHIVE_HEADERS, []);
  ensureSheet_(spreadsheet, SHEET_NAMES.RUNS, RUN_HEADERS, []);
  return spreadsheet;
}

function ensureSheet_(spreadsheet, name, headers, seedRows) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const existing = headerRange.getValues()[0];
  const empty = !existing || existing.every(function (cell) {
    return cell === '';
  });
  if (empty) {
    headerRange.setValues([headers]);
    sheet.setFrozenRows(1);
    if (seedRows.length && sheet.getLastRow() < 2) {
      sheet.getRange(2, 1, seedRows.length, headers.length).setValues(seedRows);
    }
  }
  if (lastColumn > headers.length) {
    sheet.getRange(1, headers.length + 1, 1, lastColumn - headers.length).clearContent();
  }
  return sheet;
}

function objectToRows_(object) {
  return Object.keys(object).map(function (key) {
    return [key, object[key]];
  });
}

function routeToRow_(route) {
  return [
    route.enabled != null ? route.enabled : true,
    route.source || '',
    route.origin_name !== undefined ? route.origin_name : route.originName || '',
    route.origin_id !== undefined ? route.origin_id : route.originId || '',
    route.destination_name !== undefined ? route.destination_name : route.destinationName || '',
    route.destination_id !== undefined ? route.destination_id : route.destinationId || '',
    route.origin_country !== undefined ? route.origin_country : route.originCountry || '',
    route.destination_country !== undefined ? route.destination_country : route.destinationCountry || '',
  ];
}

function readKeyValueSheet_(spreadsheet, name, defaults) {
  const sheet = spreadsheet.getSheetByName(name);
  const result = Object.assign({}, defaults);
  if (!sheet || sheet.getLastRow() < 2) {
    return result;
  }
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  values.forEach(function (row) {
    if (row[0]) {
      result[String(row[0])] = row[1];
    }
  });
  return result;
}

function readRoutes_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ROUTES);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  return values
    .filter(function (row) {
      return row[1];
    })
    .map(function (row) {
      return {
        enabled: isTruthy_(row[0]),
        source: String(row[1]).trim(),
        originName: String(row[2]).trim(),
        originId: String(row[3]).trim(),
        destinationName: String(row[4]).trim(),
        destinationId: String(row[5]).trim(),
        originCountry: String(row[6]).trim().toUpperCase(),
        destinationCountry: String(row[7]).trim().toUpperCase(),
      };
    });
}

function readArchiveFingerprints_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
  const fingerprints = new Set();
  if (!sheet || sheet.getLastRow() < 2) {
    return fingerprints;
  }
  const fpCol = ARCHIVE_HEADERS.indexOf('fingerprint');
  const sentCol = ARCHIVE_HEADERS.indexOf('telegram_sent_at');
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, ARCHIVE_HEADERS.length).getValues();
  values.forEach(function (row) {
    const fp = row[fpCol];
    const sentAt = row[sentCol];
    if (fp) {
      const sentStr = String(sentAt || '').trim();
      if (!sentStr.startsWith('FAILED:')) {
        fingerprints.add(String(fp).trim());
      }
    }
  });
  return fingerprints;
}

function appendArchiveRows_(spreadsheet, rows) {
  if (!rows || !rows.length) {
    return;
  }
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, ARCHIVE_HEADERS.length).setValues(rows);
}

function markFingerprintDismissed_(fingerprint) {
  if (!fingerprint) return;
  try {
    const cache = CacheService.getScriptCache();
    cache.put('dismissed_' + fingerprint, '1', 86400); // 24 hours
  } catch (e) {}
}

function isFingerprintDismissed_(fingerprint) {
  if (!fingerprint) return false;
  try {
    const cache = CacheService.getScriptCache();
    return cache.get('dismissed_' + fingerprint) === '1';
  } catch (e) {
    return false;
  }
}

function deleteArchiveRowsByFingerprints_(spreadsheet, fingerprintsSet) {
  if (!fingerprintsSet || fingerprintsSet.size === 0) {
    return 0;
  }
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }

  const fpCol = ARCHIVE_HEADERS.indexOf('fingerprint');
  const totalDataRows = sheet.getLastRow() - 1;
  const values = sheet.getRange(2, 1, totalDataRows, ARCHIVE_HEADERS.length).getValues();
  const remainingRows = [];
  let deletedCount = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const fp = String(row[fpCol] || '').trim();
    if (fingerprintsSet.has(fp)) {
      deletedCount++;
    } else {
      remainingRows.push(row);
    }
  }

  if (deletedCount > 0) {
    if (remainingRows.length > 0) {
      sheet.getRange(2, 1, remainingRows.length, ARCHIVE_HEADERS.length).setValues(remainingRows);
      if (sheet.getLastRow() > remainingRows.length + 1) {
        sheet.deleteRows(remainingRows.length + 2, sheet.getLastRow() - (remainingRows.length + 1));
      }
    } else {
      sheet.deleteRows(2, totalDataRows);
    }
  }

  return deletedCount;
}

function deleteArchiveRowByFingerprint_(spreadsheet, fingerprint) {
  if (!fingerprint) return false;
  const set = new Set();
  set.add(String(fingerprint).trim());
  const deleted = deleteArchiveRowsByFingerprints_(spreadsheet, set);
  return deleted > 0;
}

function appendRunRow_(spreadsheet, row) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.RUNS);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function logRun_(spreadsheet, run) {
  appendRunRow_(spreadsheet, [
    run.startedAt ? Utilities.formatDate(new Date(run.startedAt), DEFAULT_SETTINGS.timezone, "yyyy-MM-dd'T'HH:mm:ss") : '',
    run.finishedAt ? Utilities.formatDate(new Date(run.finishedAt), DEFAULT_SETTINGS.timezone, "yyyy-MM-dd'T'HH:mm:ss") : '',
    run.source || 'all',
    run.requestCount || 0,
    run.offersFound || 0,
    run.offersFiltered || 0,
    run.telegramSent || 0,
    run.status || 'OK',
    run.errorMessage || '',
  ]);
}

function offerToRow_(offer, fingerprint, matches, telegramSentAt) {
  return [
    Utilities.formatDate(new Date(), DEFAULT_SETTINGS.timezone, "yyyy-MM-dd'T'HH:mm:ss"),
    offer.source || '',
    offer.offerId || '',
    offer.vehicleId || '',
    offer.vehicle || '',
    offer.origin || '',
    offer.originCountry || '',
    offer.destination || '',
    offer.destinationCountry || '',
    offer.pickupDate || '',
    offer.returnDate || '',
    offer.price == null ? '' : offer.price,
    offer.currency || 'EUR',
    offer.bookingUrl || '',
    fingerprint || '',
    matches ? true : false,
    telegramSentAt || '',
    offer.rawJson || '',
  ];
}

function writeKeyValueSheet_(spreadsheet, name, data) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    return;
  }
  const rows = objectToRows_(data);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
}

function saveRoutes_(spreadsheet, routes) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ROUTES);
  if (!sheet) {
    return;
  }
  if (routes && routes.length) {
    routes.forEach(function (route, index) {
      if (route.source !== 'roadsurfer') {
        return;
      }
      if (!/^\d+$/.test(String(route.originId || '').trim()) ||
          (String(route.destinationId || '').trim() && !/^\d+$/.test(String(route.destinationId).trim()))) {
        throw new Error('Маршрут Roadsurfer #' + (index + 1) + ': origin_id и destination_id должны быть числовыми ID станций.');
      }
    });
  }
  const headersCount = 8;
  const lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 1, lastRow - 1, headersCount).clearContent();
  if (routes && routes.length) {
    const rows = routes.map(routeToRow_);
    sheet.getRange(2, 1, rows.length, headersCount).setValues(rows);
  }
}

function isTruthy_(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}
