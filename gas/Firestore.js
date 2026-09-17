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

function getFirestoreProjectId_() {
  var projectId = PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID');
  if (!projectId) throw new Error('FIRESTORE_PROJECT_ID не задан в Script Properties');
  return projectId;
}

// ---------------------------------------------------------------------------
// HTTP CORE (с ретраями по аналогии с Http.js)
// ---------------------------------------------------------------------------

function firestoreRequest_(method, path, payload, queryParams) {
  var projectId = getFirestoreProjectId_();
  var url = FIRESTORE_BASE_URL + '/projects/' + projectId + '/databases/(default)/documents/' + path;

  if (queryParams) {
    var qs = Object.keys(queryParams).map(function (k) {
      var v = queryParams[k];
      if (Array.isArray(v)) {
        return v.map(function (item) { return k + '=' + encodeURIComponent(item); }).join('&');
      }
      return k + '=' + encodeURIComponent(v);
    }).join('&');
    if (qs) url += (url.indexOf('?') === -1 ? '?' : '&') + qs;
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
    var response;
    try {
      response = UrlFetchApp.fetch(url, options);
    } catch (e) {
      lastError = e;
      Utilities.sleep(500 * Math.pow(2, attempt));
      continue;
    }
    var code = response.getResponseCode();
    if (code === 404) {
      if (method === 'GET') {
        var text = response.getContentText();
        try {
          var parsed = JSON.parse(text);
          var msg = (parsed.error && parsed.error.message) || '';
          if (msg.indexOf('Database') !== -1 || msg.indexOf('database') !== -1) {
            throw new Error('Firestore 404 (Database not found): ' + msg);
          }
        } catch (e) {
          if (e.message.indexOf('Firestore 404') !== -1) throw e;
        }
        return null; // документ не найден — норма для GET
      }
      throw new Error('Firestore request failed (' + code + ' ' + method + '): ' + response.getContentText());
    }
    if (code >= 200 && code < 300) {
      var text = response.getContentText();
      return text ? JSON.parse(text) : null;
    }
    if (code === 429 || code >= 500) {
      lastError = new Error('Firestore ' + code + ': ' + response.getContentText());
      Utilities.sleep(500 * Math.pow(2, attempt));
      continue;
    }
    // 4xx кроме 404/429 — не повторяем
    throw new Error('Firestore request failed (' + code + '): ' + response.getContentText());
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
  return firestoreGet('users/' + telegramId);
}

function upsertUser(telegramId, chatId, extra) {
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
  var cache = CacheService.getScriptCache();
  var key = 'routes_' + telegramId;
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  var routes = firestoreList('users/' + telegramId + '/routes');
  cache.put(key, JSON.stringify(routes), 240);
  return routes;
}

function clearUserCache(telegramId) {
  var cache = CacheService.getScriptCache();
  cache.removeAll(['routes_' + telegramId, 'filters_' + telegramId]);
}

function addUserRoute(telegramId, route) {
  clearUserCache(telegramId);
  return firestoreAdd('users/' + telegramId + '/routes', route);
}

function getUserFilters(telegramId) {
  var cache = CacheService.getScriptCache();
  var key = 'filters_' + telegramId;
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  var filters = firestoreGet('users/' + telegramId + '/settings/filters');
  cache.put(key, JSON.stringify(filters || {}), 240);
  return filters;
}

function setUserFilters(telegramId, filters) {
  clearUserCache(telegramId);
  return firestoreUpdate('users/' + telegramId + '/settings/filters', filters);
}

/**
 * Быстрая проверка "уже отправляли ли этому юзеру алерт по этому офферу" —
 * document ID = fingerprint, поэтому это один GET, без запросов с фильтрами.
 */
function hasAlertBeenSent(telegramId, fingerprint) {
  return firestoreGet('users/' + telegramId + '/sent_alerts/' + fingerprint) !== null;
}

function markAlertSent(telegramId, fingerprint, offerSummary) {
  return firestoreUpdate('users/' + telegramId + '/sent_alerts/' + fingerprint, Object.assign({
    sent_at: new Date()
  }, offerSummary || {}));
}

/**
 * Список активных пользователей с включённым ботом — для рассылки/обхода.
 */
function listActiveUsers() {
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


