import { useEffect, useState } from 'react';

export type PWAStatus = {
  /** Whether the app is currently offline */
  isOffline: boolean;
  /** Whether a service worker is active and controlling the page */
  isServiceWorkerActive: boolean;
  /** Whether the PWA is installed (standalone mode) */
  isInstalled: boolean;
  /** Whether the app can work offline (SW active) */
  canWorkOffline: boolean;
};

/**
 * Hook to detect PWA installation status, offline mode, and service worker readiness.
 */
export function usePWAStatus(): PWAStatus {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [isServiceWorkerActive, setIsServiceWorkerActive] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if running in standalone mode (PWA installed)
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean })
          .standalone === true;
      setIsInstalled(isStandalone);
    };
    checkInstalled();

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => checkInstalled();
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    // Check service worker status
    const checkServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        setIsServiceWorkerActive(registration?.active !== undefined);
      }
    };
    checkServiceWorker();

    // Listen for service worker state changes
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        setIsServiceWorkerActive(true);
      });
    }

    // Online/offline listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const canWorkOffline = isServiceWorkerActive;

  return {
    isOffline,
    isServiceWorkerActive,
    isInstalled,
    canWorkOffline,
  };
}

/**
 * Preload ffmpeg core into cache/memory for faster first use.
 * This is useful for "preparing" the app for offline use.
 */
export async function warmupFFmpeg(): Promise<void> {
  // Dynamically import to avoid circular dependencies
  const audioProcessor = await import('../../lib/audioProcessor');
  await audioProcessor.ensureFFmpegLoaded();
}
