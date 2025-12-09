import { useCallback, useState } from 'react';

const STORAGE_KEY = 'analytics-consent';

export type AnalyticsConsent = boolean | null;

export function useAnalyticsConsent() {
  const isBrowser = typeof window !== 'undefined';
  const [consent, setConsentState] = useState<AnalyticsConsent>(() => {
    if (!isBrowser) return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return null; // Not yet decided
  });

  const setConsent = useCallback((next: boolean) => {
    setConsentState(next);
    if (isBrowser) {
      localStorage.setItem(STORAGE_KEY, String(next));
    }
  }, [isBrowser]);

  return { consent, setConsent };
}
