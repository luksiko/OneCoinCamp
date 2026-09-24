export interface FetchOptions extends RequestInit {
  timeoutSeconds?: number;
  retries?: number;
}

export async function fetchJson<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
  const retries = options.retries == null ? 2 : options.retries;
  const timeoutSeconds = Math.min(Math.max(Number(options.timeoutSeconds) || 20, 5), 60);

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

  throw lastError || new Error(`Unreachable fetch for ${maskUrl(url)}`);
}

export function maskUrl(url: string): string {
  return String(url || '')
    .replace(/\/bot[^/]+/g, '/bot[REDACTED]')
    .replace(/secret=[^&]+/g, 'secret=[REDACTED]')
    .replace(/secret_token=[^&]+/g, 'secret_token=[REDACTED]');
}
