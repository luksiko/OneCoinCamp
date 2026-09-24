export interface FetchOptions extends RequestInit {
  timeoutSeconds?: number;
  retries?: number;
  useProxy?: 'never' | 'auto' | 'always';
  proxyUrl?: string;
}

let globalGasProxyUrl: string | undefined = undefined;
const KNOWN_PROXY_DOMAINS = new Set<string>();

export function setGasProxyUrl(url?: string): void {
  globalGasProxyUrl = url ? url.trim() : undefined;
}

export function getGasProxyUrl(): string | undefined {
  return globalGasProxyUrl;
}

export function addKnownProxyDomain(domain: string): void {
  if (domain) {
    KNOWN_PROXY_DOMAINS.add(domain.toLowerCase().trim());
  }
}

export async function fetchJson<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
  const retries = options.retries == null ? 2 : options.retries;
  const timeoutSeconds = Math.min(Math.max(Number(options.timeoutSeconds) || 20, 5), 60);

  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = '';
  }

  const proxyUrl = (options.proxyUrl || globalGasProxyUrl || '').trim();
  const isExcludedFromProxy =
    !proxyUrl ||
    host === 'api.telegram.org' ||
    host === 'booking.roadsurfer.com' ||
    host.endsWith('movacar.de') ||
    host.endsWith('run.app') ||
    url.includes('/macros/s/') ||
    options.useProxy === 'never';

  // 1. If host is already known to block direct Cloudflare access, or useProxy is 'always', go directly via proxy
  const shouldDirectlyProxy =
    !isExcludedFromProxy &&
    (options.useProxy === 'always' || KNOWN_PROXY_DOMAINS.has(host));

  if (shouldDirectlyProxy) {
    return fetchViaGasProxy<T>(proxyUrl, url, options);
  }

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const status = response.status;
      const text = await response.text();

      if (status >= 200 && status < 300) {
        if (!text || text.trim() === '') {
          return {} as T;
        }
        try {
          return JSON.parse(text) as T;
        } catch (e: any) {
          throw new Error(`Invalid JSON from ${maskUrl(url)}: ${text.slice(0, 300)}`);
        }
      }

      lastError = new Error(`HTTP ${status} for ${maskUrl(url)}: ${text.slice(0, 300)}`);

      const retryable = status === 429 || (status >= 500 && status <= 504);
      if (!retryable || attempt === retries) {
        break;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      if (attempt === retries) {
        break;
      }
    }

    // Exponential backoff
    await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 1000));
  }

  // 2. Automatic fallback to GAS proxy if direct fetch failed and proxy is available
  if (!isExcludedFromProxy && lastError) {
    console.warn(`Direct fetch failed (${lastError.message || lastError}), falling back to GAS proxy for ${maskUrl(url)}`);
    try {
      const proxiedResult = await fetchViaGasProxy<T>(proxyUrl, url, options);
      if (host) {
        KNOWN_PROXY_DOMAINS.add(host);
      }
      return proxiedResult;
    } catch (proxyError: any) {
      console.error(`GAS proxy fallback failed for ${maskUrl(url)}:`, proxyError.message || proxyError);
      throw new Error(`Direct failed: [${lastError.message}] & Proxy fallback failed: [${proxyError.message}]`);
    }
  }

  throw lastError || new Error(`Unreachable fetch for ${maskUrl(url)}`);
}

export async function fetchViaGasProxy<T = any>(
  proxyUrl: string,
  targetUrl: string,
  options: FetchOptions = {}
): Promise<T> {
  const timeoutSeconds = Math.min(Math.max(Number(options.timeoutSeconds) || 25, 5), 60);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  const method = (options.method || 'GET').toUpperCase();
  const headersObj: Record<string, string> = {};
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((v, k) => {
        headersObj[k] = v;
      });
    } else if (Array.isArray(options.headers)) {
      for (const [k, v] of options.headers) {
        headersObj[k] = v;
      }
    } else {
      Object.assign(headersObj, options.headers);
    }
  }

  const payload = options.body ? String(options.body) : null;

  try {
    const response = await fetch(`${proxyUrl}?proxy=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: targetUrl,
        method,
        headers: headersObj,
        payload,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const proxyText = await response.text();
    let proxyJson: any;
    try {
      proxyJson = JSON.parse(proxyText);
    } catch (e: any) {
      throw new Error(`Invalid response from GAS proxy: ${proxyText.slice(0, 300)}`);
    }

    if (proxyJson && proxyJson.error) {
      throw new Error(`GAS proxy error: ${proxyJson.error}`);
    }

    const status = Number(proxyJson.status) || 200;
    const bodyText = proxyJson.body != null ? String(proxyJson.body) : '';

    if (status >= 200 && status < 300) {
      if (!bodyText || bodyText.trim() === '') {
        return {} as T;
      }
      try {
        return JSON.parse(bodyText) as T;
      } catch (e: any) {
        throw new Error(`Invalid JSON from ${maskUrl(targetUrl)} via proxy: ${bodyText.slice(0, 300)}`);
      }
    }

    throw new Error(`HTTP ${status} for ${maskUrl(targetUrl)} via proxy: ${bodyText.slice(0, 300)}`);
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export function maskUrl(url: string): string {
  return String(url || '')
    .replace(/\/bot[^/]+/g, '/bot[REDACTED]')
    .replace(/secret=[^&]+/g, 'secret=[REDACTED]')
    .replace(/secret_token=[^&]+/g, 'secret_token=[REDACTED]');
}
