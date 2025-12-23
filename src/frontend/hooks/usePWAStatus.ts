import { useEffect, useState } from 'react';
import { preloadFFmpegCore } from '../../lib/audioProcessor';

export type PWAStatus = {
  /** Whether the app is currently offline */
  isOffline: boolean;
  /** Whether a service worker is active and controlling the page */
  isServiceWorkerActive: boolean;
  /** Whether the PWA is installed (standalone mode) */
  isInstalled: boolean;
  /** Whether the app can work offline (SW active) */
  canWorkOffline: boolean;
  /** Whether ffmpeg core has been preloaded into cache */
  isFFmpegCached: boolean;
};

// Track if we've already triggered preload (singleton across hook instances)
let preloadTriggered = false;

/**
 * Hook to detect PWA installation status, offline mode, and service worker readiness.
 * Also triggers ffmpeg core preload when service worker is ready.
 */
export function usePWAStatus(): PWAStatus {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [isServiceWorkerActive, setIsServiceWorkerActive] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isFFmpegCached, setIsFFmpegCached] = useState(false);

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

    // Preload ffmpeg core when SW is ready
    const triggerPreload = () => {
      if (preloadTriggered) return;
      preloadTriggered = true;
      preloadFFmpegCore()
        .then(() => setIsFFmpegCached(true))
        .catch(() => {
          // Reset so it can retry
          preloadTriggered = false;
        });
    };

    // Check service worker status and trigger preload
    const checkServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        const isActive = registration?.active !== undefined;
        setIsServiceWorkerActive(isActive);
        if (isActive && navigator.serviceWorker.controller) {
          triggerPreload();
        }
      }
    };
    checkServiceWorker();

    // Listen for service worker state changes
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        setIsServiceWorkerActive(true);
        triggerPreload();
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

  const canWorkOffline = isServiceWorkerActive && isFFmpegCached;

  return {
    isOffline,
    isServiceWorkerActive,
    isInstalled,
    canWorkOffline,
    isFFmpegCached,
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
