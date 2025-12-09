import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'analytics-consent';

export type AnalyticsConsent = boolean | null;

const getInitialConsent = (): AnalyticsConsent => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  const initial = (window as typeof window & { __INITIAL_CONSENT__?: boolean })
    .__INITIAL_CONSENT__;
  return initial ?? null;
};

export function useAnalyticsConsent() {
  const isBrowser = typeof window !== 'undefined';
  const [consent, setConsentState] =
    useState<AnalyticsConsent>(getInitialConsent);

  useEffect(() => {
    if (!isBrowser) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setConsentState(true);
    } else if (stored === 'false') {
      setConsentState(false);
    }
  }, [isBrowser]);

  const setConsent = useCallback(
    (next: boolean) => {
      setConsentState(next);
      if (isBrowser) {
        localStorage.setItem(STORAGE_KEY, String(next));
      }
    },
    [isBrowser],
  );

  return { consent, setConsent };
}
