import { useCallback, useState } from 'react';

const STORAGE_KEY = 'analytics-consent';

export type AnalyticsConsent = boolean | null;

export function useAnalyticsConsent() {
  const [consent, setConsentState] = useState<AnalyticsConsent>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return null; // Not yet decided
  });

  const setConsent = useCallback((next: boolean) => {
    setConsentState(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  return { consent, setConsent };
}
