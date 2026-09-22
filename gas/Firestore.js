/**
 * Firestore.js
 *
 * Тонкая обёртка над Firestore REST API для Google Apps Script.
 * Без сторонних библиотек — аутентификация через Service Account (JWT → OAuth2 access token),
 * подписанный встроенным Utilities.computeRsaSha256Signature.
 *
 * НАСТРОЙКА (см. firestore-schema.md):
 * 1. Создать GCP-проект (или использовать существующий Firebase-проект), включить Firestore
 *    в Native mode.
 * 2. Создать Service Account с ролью "Cloud Datastore User" (или "Firebase Admin"),
 *    скачать JSON-ключ.
 * 3. В Script Properties (Project Settings → Script Properties) добавить:
 *      FIRESTORE_PROJECT_ID     — project_id из JSON-ключа
 *      FIRESTORE_CLIENT_EMAIL   — client_email из JSON-ключа
 *      FIRESTORE_PRIVATE_KEY    — private_key из JSON-ключа, КАК ЕСТЬ (с \n внутри строки)
 *    Ключ и токен НЕ хранить в коде и не класть в Git — так же, как TELEGRAM_BOT_TOKEN.
 */

var FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1';
var FIRESTORE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
var FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
var FIRESTORE_TOKEN_CACHE_KEY = 'firestore_access_token';
var FIRESTORE_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

function base64UrlEncode_(bytesOrString) {
  var bytes = (typeof bytesOrString === 'string')
    ? Utilities.newBlob(bytesOrString).getBytes()
    : bytesOrString;
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function getFirestoreAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(FIRESTORE_TOKEN_CACHE_KEY);
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var clientEmail = props.getProperty('FIRESTORE_CLIENT_EMAIL');
  var privateKey = props.getProperty('FIRESTORE_PRIVATE_KEY');

  if (!clientEmail || !privateKey) {
    throw new Error('FIRESTORE_CLIENT_EMAIL / FIRESTORE_PRIVATE_KEY не заданы в Script Properties');
  }

  // Script Properties хранит private_key одной строкой; JSON.parse восстанавливает реальные переводы строк,
  // если ключ был вставлен как есть из скачанного JSON (с литеральными \n).
  if (privateKey.indexOf('\\n') !== -1) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'RS256', typ: 'JWT' };
  var claimSet = {
    iss: clientEmail,
    scope: FIRESTORE_SCOPE,
    aud: FIRESTORE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  var signingInput = base64UrlEncode_(JSON.stringify(header)) + '.' + base64UrlEncode_(JSON.stringify(claimSet));
  var signatureBytes = Utilities.computeRsaSha256Signature(signingInput, privateKey);
  var jwt = signingInput + '.' + base64UrlEncode_(signatureBytes);

  var response = UrlFetchApp.fetch(FIRESTORE_TOKEN_URL, {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText());
  if (code !== 200) {
    throw new Error('Firestore auth failed (' + code + '): ' + response.getContentText());
  }

  var accessToken = body.access_token;
  var expiresIn = body.expires_in || 3600;
  // кэшируем с запасом в 5 минут до реального истечения
  cache.put(FIRESTORE_TOKEN_CACHE_KEY, accessToken, Math.max(60, expiresIn - 300));
  return accessToken;
}

function isFirestoreConfigured_() {
  try {
    var props = PropertiesService.getScriptProperties();
    return !!(props && props.getProperty('FIRESTORE_PROJECT_ID') && props.getProperty('FIRESTORE_CLIENT_EMAIL') && props.getProperty('FIRESTORE_PRIVATE_KEY'));
  } catch (e) {
    return false;
  }
}

function getFirestoreProjectId_() {
  var projectId = PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID');
  if (!projectId) throw new Error('FIRESTORE_PROJECT_ID не задан в Script Properties');
  return projectId;
}

function getFirestoreDatabaseId_() {
  var prop = PropertiesService.getScriptProperties().getProperty('FIRESTORE_DATABASE_ID');
  return prop || 'default';
}

// ---------------------------------------------------------------------------
// HTTP CORE (с ретраями по аналогии с Http.js)
// ---------------------------------------------------------------------------

function firestoreRequest_(method, path, payload, queryParams) {
  var projectId = getFirestoreProjectId_();
  var dbId = getFirestoreDatabaseId_();

  function buildUrl(currentDbId) {
    var u = FIRESTORE_BASE_URL + '/projects/' + projectId + '/databases/' + currentDbId + '/documents/' + path;
    if (queryParams) {
      var qs = Object.keys(queryParams).map(function (k) {
        var v = queryParams[k];
        if (Array.isArray(v)) {
          return v.map(function (item) { return k + '=' + encodeURIComponent(item); }).join('&');
        }
        return k + '=' + encodeURIComponent(v);
      }).join('&');
      if (qs) u += (u.indexOf('?') === -1 ? '?' : '&') + qs;
    }
    return u;
  }

  var options = {
    method: method,
    headers: { Authorization: 'Bearer ' + getFirestoreAccessToken_() },
    muteHttpExceptions: true,
    contentType: 'application/json'
  };
  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  var lastError;
  for (var attempt = 0; attempt <= FIRESTORE_MAX_RETRIES; attempt++) {
    var url = buildUrl(dbId);
    var response;
    try {
      response = UrlFetchApp.fetch(url, options);
    } catch (e) {
      lastError = e;
      Utilities.sleep(500 * Math.pow(2, attempt));
      continue;
    }
    var code = response.getResponseCode();
    var text = response.getContentText() || '';

    // Если база с текущим ID не найдена, пробуем альтернативный ID ('default' <-> '(default)')
    if (code === 404 && (text.indexOf('does not exist') !== -1 || text.indexOf('Database') !== -1) && (text.indexOf('(default)') !== -1 || text.indexOf('default') !== -1)) {
      var altDbId = (dbId === '(default)') ? 'default' : '(default)';
      if (altDbId !== dbId) {
        try {
          var altUrl = buildUrl(altDbId);
          var altResponse = UrlFetchApp.fetch(altUrl, options);
          var altCode = altResponse.getResponseCode();
          if (altCode >= 200 && altCode < 300) {
            dbId = altDbId;
            CacheService.getScriptCache().put('firestore_db_id', altDbId, 21600);
            var altText = altResponse.getContentText();
            return altText ? JSON.parse(altText) : null;
          }
        } catch (e) {}
      }
    }

    if (code === 404) {
      if (method === 'GET') {
        try {
          var parsed = JSON.parse(text);
          var msg = (parsed.error && parsed.error.message) || '';
          if (msg.indexOf('does not exist') !== -1 && msg.indexOf('database') !== -1) {
            throw new Error('Firestore 404 (Database not found): ' + msg);
          }
        } catch (e) {
          if (e.message.indexOf('Firestore 404') !== -1) throw e;
        }
        return null; // документ не найден — штатно для GET
      }
      throw new Error('Firestore request failed (' + code + ' ' + method + '): ' + text);
    }
    if (code >= 200 && code < 300) {
      return text ? JSON.parse(text) : null;
    }
    if (code === 429 || code >= 500) {
      lastError = new Error('Firestore ' + code + ': ' + text);
      Utilities.sleep(500 * Math.pow(2, attempt));
      continue;
    }
    // 4xx кроме 404/429 — не повторяем
    throw new Error('Firestore request failed (' + code + '): ' + text);
  }
  throw lastError || new Error('Firestore request failed after retries');
}

// ---------------------------------------------------------------------------
// JS <-> Firestore value conversion
// ---------------------------------------------------------------------------

function toFirestoreValue_(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue_) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: objectToFields_(value) } };
  }
  throw new Error('Unsupported value type for Firestore: ' + typeof value);
}

function fromFirestoreValue_(value) {
  if (!value) return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return parseInt(value.integerValue, 10);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue; // ISO string
  if ('arrayValue' in value) {
    var arr = (value.arrayValue.values || []);
    return arr.map(fromFirestoreValue_);
  }
  if ('mapValue' in value) {
    return fieldsToObject_(value.mapValue.fields || {});
  }
  return null;
}

function objectToFields_(obj) {
  var fields = {};
  Object.keys(obj).forEach(function (key) {
    fields[key] = toFirestoreValue_(obj[key]);
  });
  return fields;
}

function fieldsToObject_(fields) {
  var obj = {};
  Object.keys(fields || {}).forEach(function (key) {
    obj[key] = fromFirestoreValue_(fields[key]);
  });
  return obj;
}

// ---------------------------------------------------------------------------
// CRUD ПУБЛИЧНОЕ API
// ---------------------------------------------------------------------------

/**
 * Прочитать документ по пути, например 'users/123456789'.
 * @returns {Object|null} plain object или null, если документа нет.
 */
function firestoreGet(path) {
  var doc = firestoreRequest_('GET', path);
  if (!doc) return null;
  return fieldsToObject_(doc.fields);
}

/**
 * Создать/полностью перезаписать документ по заданному ID.
 * path — например 'users/123456789'.
 */
function firestoreSet(path, obj) {
  return firestoreRequest_('PATCH', path, {
    fields: objectToFields_(obj)
  });
}

/**
 * Частичное обновление (merge) существующего документа. Создаёт документ, если его нет.
 */
function firestoreUpdate(path, obj) {
  var fieldPaths = Object.keys(obj);
  var updateMask = fieldPaths.map(function (f) { return 'updateMask.fieldPaths=' + encodeURIComponent(f); }).join('&');
  var url = path + (updateMask ? '?' + updateMask : '');
  return firestoreRequest_('PATCH', url, { fields: objectToFields_(obj) });
}

/**
 * Создать документ со сгенерированным Firestore ID в коллекции.
 * collectionPath — например 'runs'.
 * @returns {string} ID нового документа.
 */
function firestoreAdd(collectionPath, obj) {
  var result = firestoreRequest_('POST', collectionPath, { fields: objectToFields_(obj) });
  var name = result.name; // .../documents/collection/DOC_ID
  return name.split('/').pop();
}

function firestoreDelete(path) {
  firestoreRequest_('DELETE', path);
}

/**
 * Список документов в коллекции (без сложных запросов, с пагинацией).
 * Подходит для небольших коллекций (пользователи, маршруты) — для вашего масштаба достаточно.
 */
function firestoreList(collectionPath, pageSize) {
  var results = [];
  var pageToken = null;
  do {
    var params = { pageSize: pageSize || 100 };
    if (pageToken) params.pageToken = pageToken;
    var response = firestoreRequest_('GET', collectionPath, null, params);
    if (response && response.documents) {
      response.documents.forEach(function (doc) {
        var id = doc.name.split('/').pop();
        results.push(Object.assign({ _id: id }, fieldsToObject_(doc.fields)));
      });
    }
    pageToken = response ? response.nextPageToken : null;
  } while (pageToken);
  return results;
}

// ---------------------------------------------------------------------------
// ПРОЕКТНЫЕ ХЕЛПЕРЫ (см. firestore-schema.md за описанием коллекций)
// ---------------------------------------------------------------------------

function getUser(telegramId) {
  if (!isFirestoreConfigured_()) return null;
  var cache = CacheService.getScriptCache();
  var key = 'user_' + telegramId;
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  var user = firestoreGet('users/' + telegramId);
  if (user) {
    try { cache.put(key, JSON.stringify(user), 240); } catch(e) {}
  }
  return user;
}

function upsertUser(telegramId, chatId, extra) {
  if (!isFirestoreConfigured_()) return null;
  clearUserCache(telegramId);
  var data = Object.assign({
    telegram_id: telegramId,
    chat_id: chatId,
    status: 'active',
    last_seen_at: new Date()
  }, extra || {});
  var existing = getUser(telegramId);
  if (!existing) {
    data.created_at = new Date();
    CacheService.getScriptCache().remove('active_users');
  } else if (existing.status !== 'active') {
    CacheService.getScriptCache().remove('active_users');
  }
  return firestoreUpdate('users/' + telegramId, data);
}

function getUserRoutes(telegramId) {
  if (!isFirestoreConfigured_()) return [];
  var routes = firestoreList('users/' + telegramId + '/routes') || [];
  var userDoc = getUser(telegramId);
  var isConfigured = Boolean(userDoc && userDoc.routes_configured);

  if ((!routes || routes.length === 0) && !isConfigured && String(telegramId) !== '999') {
    try {
      var devRoutes = firestoreList('users/999/routes') || [];
      if (devRoutes && devRoutes.length > 0) {
        devRoutes.forEach(function (r) {
          var copy = Object.assign({}, r);
          delete copy._id;
          addUserRoute(telegramId, copy);
        });
        routes = firestoreList('users/' + telegramId + '/routes') || [];
        firestoreUpdate('users/' + telegramId, { routes_configured: true });
        clearUserCache(telegramId);
      }
    } catch (e) {}
  } else if (routes && routes.length > 0 && !isConfigured) {
    try {
      firestoreUpdate('users/' + telegramId, { routes_configured: true });
      clearUserCache(telegramId);
    } catch (e) {}
  }
  
  // Автоматическая дедупликация и удаление лишних дубликатов из базы Firestore
  var seen = {};
  var uniqueRoutes = [];
  routes.forEach(function (r) {
    var src = String(r.source || 'roadsurfer').toLowerCase().trim();
    var oCountry = String(r.origin_country || r.originCountry || 'DE').toUpperCase().trim();
    var dCountry = String(r.destination_country || r.destinationCountry || '').toUpperCase().trim();
    var oCity = String(r.origin_name || r.originName || r.origin_id || r.originId || '*').toLowerCase().trim();
    var dCity = String(r.destination_name || r.destinationName || r.destination_id || r.destinationId || '*').toLowerCase().trim();
    var sig = src + '|' + oCountry + '|' + oCity + '|' + dCountry + '|' + dCity;

    if (!seen[sig]) {
      seen[sig] = true;
      uniqueRoutes.push(r);
    } else if (r._id) {
      try {
        firestoreDelete('users/' + telegramId + '/routes/' + r._id);
      } catch (e) {}
    }
  });

  return uniqueRoutes;
}

function clearUserCache(telegramId) {
  try {
    var cache = (typeof CacheService !== 'undefined' && CacheService.getScriptCache) ? CacheService.getScriptCache() : null;
    if (cache) {
      var keys = ['routes_' + telegramId, 'filters_' + telegramId, 'user_' + telegramId, 'active_users'];
      if (typeof cache.removeAll === 'function') {
        cache.removeAll(keys);
      } else if (typeof cache.remove === 'function') {
        keys.forEach(function(k) { cache.remove(k); });
      }
    }
  } catch (e) {}
}

function deleteAllUserRoutes(telegramId) {
  if (!isFirestoreConfigured_()) return 0;
  clearUserCache(telegramId);
  var routes = firestoreList('users/' + telegramId + '/routes') || [];
  routes.forEach(function(r) {
    if (r && r._id) firestoreDelete('users/' + telegramId + '/routes/' + r._id);
  });
  try {
    firestoreUpdate('users/' + telegramId, { routes_configured: true });
  } catch (e) {}
  clearUserCache(telegramId);
  return routes.length;
}

function addUserRoute(telegramId, route) {
  if (!isFirestoreConfigured_()) return null;
  clearUserCache(telegramId);
  var normalized = Object.assign({}, route);
  if (normalized.originName && !normalized.origin_name) normalized.origin_name = normalized.originName;
  if (normalized.destinationName && !normalized.destination_name) normalized.destination_name = normalized.destinationName;
  if (normalized.originId && !normalized.origin_id) normalized.origin_id = normalized.originId;
  if (normalized.destinationId && !normalized.destination_id) normalized.destination_id = normalized.destinationId;
  if (normalized.originCountry && !normalized.origin_country) normalized.origin_country = normalized.originCountry;
  if (normalized.destinationCountry && !normalized.destination_country) normalized.destination_country = normalized.destinationCountry;

  if (normalized.origin_name && !normalized.originName) normalized.originName = normalized.origin_name;
  if (normalized.destination_name && !normalized.destinationName) normalized.destinationName = normalized.destination_name;
  if (normalized.origin_id && !normalized.originId) normalized.originId = normalized.origin_id;
  if (normalized.destination_id && !normalized.destinationId) normalized.destinationId = normalized.destination_id;
  if (normalized.origin_country && !normalized.originCountry) normalized.originCountry = normalized.origin_country;
  if (normalized.destination_country && !normalized.destinationCountry) normalized.destinationCountry = normalized.destination_country;
  var added = firestoreAdd('users/' + telegramId + '/routes', normalized);
  try {
    firestoreUpdate('users/' + telegramId, { routes_configured: true });
  } catch (e) {}
  return added;
}

function getUserFilters(telegramId) {
  if (!isFirestoreConfigured_()) return {};
  var cache = CacheService.getScriptCache();
  var key = 'filters_' + telegramId;
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  var filters = firestoreGet('users/' + telegramId + '/settings/filters');
  if ((!filters || Object.keys(filters).length === 0 || filters.price_max == null) && String(telegramId) !== '999') {
    try {
      var devFilters = firestoreGet('users/999/settings/filters');
      if (devFilters && Object.keys(devFilters).length > 0 && devFilters.price_max != null) {
        filters = Object.assign({}, devFilters, filters || {});
        setUserFilters(telegramId, filters);
      }
    } catch (e) {}
  }
  cache.put(key, JSON.stringify(filters || {}), 240);
  return filters;
}

function setUserFilters(telegramId, filters) {
  if (!isFirestoreConfigured_()) return null;
  clearUserCache(telegramId);
  return firestoreUpdate('users/' + telegramId + '/settings/filters', filters);
}

/**
 * Быстрая проверка "уже отправляли ли этому юзеру алерт по этому офферу" —
 * document ID = fingerprint, поэтому это один GET, без запросов с фильтрами.
 */
function hasAlertBeenSent(telegramId, fingerprint) {
  if (!fingerprint || fingerprint === 'undefined') return false;
  if (!isFirestoreConfigured_()) return false;
  const doc = firestoreGet('users/' + telegramId + '/sent_alerts/' + fingerprint);
  if (!doc) return false;
  // TTL check: if the alert was sent more than 48 hours ago, treat as expired
  // so renewed or reappearing slots can notify the user again.
  if (doc.sent_at) {
    const sentTime = new Date(doc.sent_at).getTime();
    if (!isNaN(sentTime) && (Date.now() - sentTime) > 48 * 60 * 60 * 1000) {
      return false;
    }
  }
  return true;
}

var cleanupUndefinedCache_ = {};

function markAlertSent(telegramId, fingerprint, offerSummary) {
  if (!fingerprint || fingerprint === 'undefined') return;
  if (!isFirestoreConfigured_()) return;
  
  // Clean up legacy corrupted undefined doc if present (once per user per execution)
  if (!cleanupUndefinedCache_[telegramId]) {
    try {
      firestoreDelete('users/' + telegramId + '/sent_alerts/undefined');
    } catch (e) {}
    cleanupUndefinedCache_[telegramId] = true;
  }
  
  return firestoreUpdate('users/' + telegramId + '/sent_alerts/' + fingerprint, Object.assign({
    sent_at: new Date()
  }, offerSummary || {}));
}

/**
 * Список активных пользователей с включённым ботом — для рассылки/обхода.
 */
function listActiveUsers() {
  if (!isFirestoreConfigured_()) return [];
  var cache = CacheService.getScriptCache();
  var cached = cache.get('active_users');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var users = firestoreList('users').filter(function (u) { return u.status === 'active'; });
  cache.put('active_users', JSON.stringify(users), 240);
  return users;
}

/**
 * Разовая проверка подключения к Firestore из редактора Apps Script.
 */
function testFirestore() {
  Logger.log('1. Тестирование получения Access Token...');
  try {
    var token = getFirestoreAccessToken_();
    Logger.log('✅ Access Token успешно получен: ' + token.substring(0, 15) + '...');
  } catch (e) {
    Logger.log('❌ Ошибка авторизации: ' + e.message);
    return;
  }

  Logger.log('2. Тестирование записи (upsertUser)...');
  try {
    var res = upsertUser(123456789, 987654321, { username: 'test_user' });
    Logger.log('✅ Результат upsertUser: ' + JSON.stringify(res));
  } catch (e) {
    Logger.log('❌ Ошибка upsertUser: ' + e.message);
    return;
  }

  Logger.log('3. Тестирование чтения (getUser)...');
  try {
    var user = getUser(123456789);
    Logger.log('Результат getUser: ' + JSON.stringify(user));
    if (user && user.telegram_id === 123456789) {
      Logger.log('🎉 УСПЕХ: Подключение к Firestore работает штатно!');
    } else {
      Logger.log('❌ Не удалось прочитать пользователя (null).');
    }
  } catch (e) {
    Logger.log('❌ Ошибка getUser: ' + e.message);
  }
}


