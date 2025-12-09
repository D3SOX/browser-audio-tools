import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Theme } from '../types';

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system';
  const initial = (window as typeof window & { __INITIAL_THEME__?: Theme })
    .__INITIAL_THEME__;
  return initial ?? 'system';
};

export function useTheme() {
  const isBrowser = typeof window !== 'undefined';
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    if (!isBrowser) return;
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored) {
      setThemeState(stored);
    }
  }, [isBrowser]);

  const resolvedTheme = useMemo(() => {
    if (!isBrowser) {
      return theme === 'dark' ? 'dark' : 'light';
    }
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return theme;
  }, [theme, isBrowser]);

  useEffect(() => {
    if (!isBrowser) return;
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme, isBrowser]);

  useEffect(() => {
    if (!isBrowser || theme !== 'system') return;
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      document.documentElement.setAttribute(
        'data-theme',
        mq.matches ? 'dark' : 'light',
      );
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, isBrowser]);

  const setTheme = useCallback(
    (next: Theme) => {
      if (!isBrowser) {
        setThemeState(next);
        return;
      }
      const nextResolved =
        next === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : next;

      const applyTheme = () => {
        document.documentElement.setAttribute('data-theme', nextResolved);
        setThemeState(next);
        localStorage.setItem('theme', next);
      };

      // Check for reduced motion or lack of API support
      if (
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        !document.startViewTransition
      ) {
        applyTheme();
        return;
      }

      // Firefox detection for flicker workaround
      const isFirefox = navigator.userAgent.includes('Firefox');
      if (isFirefox) {
        document.documentElement.classList.add('is-firefox');
      }

      const transition = document.startViewTransition(applyTheme);

      transition.ready.then(() => {
        const x = window.innerWidth;
        // Math.hypot returns the Euclidean distance from (0,0) to (x, window.innerHeight),
        // effectively giving the farthest distance from the top-right corner to any corner of the viewport.
        // This is used to ensure the animated circle covers the entire screen.
        const maxRadius = Math.hypot(x, window.innerHeight);

        const opts: KeyframeAnimationOptions = {
          duration: 800,
          easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
          pseudoElement: '::view-transition-new(root)',
        };

        // Firefox needs fill:none to avoid end flicker
        if (!isFirefox) {
          opts.fill = 'forwards';
        }

        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px 0px)`,
              `circle(${maxRadius}px at ${x}px 0px)`,
            ],
          },
          opts,
        );
      });
    },
    [isBrowser],
  );

  return { theme, resolvedTheme, setTheme };
}
