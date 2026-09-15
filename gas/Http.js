function fetchJson_(url, options) {
  const retries = options.retries == null ? 2 : options.retries;
  const mute = options.muteHttpExceptions !== false;
  const timeoutSeconds = Math.min(Math.max(Number(options.timeoutSeconds) || 20, 5), 60);
  const request = {
    method: options.method || 'get',
    headers: options.headers || {},
    muteHttpExceptions: mute,
    followRedirects: true,
    timeoutInMilliseconds: timeoutSeconds * 1000,
  };
  if (options.payload) {
    request.payload = options.payload;
    request.contentType = options.contentType || 'application/json';
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = UrlFetchApp.fetch(url, request);
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
      Utilities.sleep(Math.pow(2, attempt) * 1000);
      continue;
    }
    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code >= 200 && code < 300) {
      if (!body) {
        return {};
      }
      try {
        return JSON.parse(body);
      } catch (error) {
        throw new Error('Invalid JSON from ' + maskUrl_(url) + ': ' + body.slice(0, 300));
      }
    }
    lastError = new Error('HTTP ' + code + ' for ' + maskUrl_(url) + ': ' + body.slice(0, 300));
    // 403, 400 and other non-retryable codes must fail fast, see docs/architecture.md.
    const retryable = code === 429 || (code >= 500 && code <= 504);
    if (!retryable || attempt === retries) {
      break;
    }
    Utilities.sleep(Math.pow(2, attempt) * 1000);
  }
  throw lastError || new Error('Unreachable fetch for ' + maskUrl_(url));
}

function maskUrl_(url) {
  return String(url || '')
    .replace(/\/bot[^/]+/g, '/bot[REDACTED]')
    .replace(/secret=[^&]+/g, 'secret=[REDACTED]')
    .replace(/secret_token=[^&]+/g, 'secret_token=[REDACTED]');
}

function randomRequestId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}
