export type AdblockDetectionResult = 'allowed' | 'blocked' | 'unknown';

const getTestUrl = () => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/_vercel/insights/script.js`;
};

type DetectOptions = {
  timeoutMs?: number;
};

/**
 * Heuristically detects whether an adblocker cancels analytics requests.
 * Treats failures/timeouts as blocked to err on the safe side.
 */
export async function detectAdblock({
  timeoutMs = 1200,
}: DetectOptions = {}): Promise<AdblockDetectionResult> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return 'unknown';
  }

  const testUrl = getTestUrl();
  if (!testUrl) return 'unknown';

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(testUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    // If the request resolves (even as opaque), assume it was not blocked.
    return 'allowed';
  } catch {
    window.clearTimeout(timer);
    // Treat any failure or cancellation as blocked to err on the safe side.
    return 'blocked';
  }
}
