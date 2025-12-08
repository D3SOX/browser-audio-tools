import { useCallback, useEffect, useMemo, useState } from "react";
import type { Theme } from "../types";

// View Transitions API type declarations
interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}

declare global {
  interface Document {
    startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    return stored ?? "system";
  });

  const resolvedTheme = useMemo(() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    const nextResolved =
      next === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next;

    const applyTheme = () => {
      document.documentElement.setAttribute("data-theme", nextResolved);
      setThemeState(next);
      localStorage.setItem("theme", next);
    };

    // Check for reduced motion or lack of API support
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !document.startViewTransition
    ) {
      applyTheme();
      return;
    }

    // Firefox detection for flicker workaround
    const isFirefox = navigator.userAgent.includes("Firefox");
    if (isFirefox) {
      document.documentElement.classList.add("is-firefox");
    }

    const transition = document.startViewTransition(applyTheme);

    transition.ready.then(() => {
      const x = window.innerWidth;
      const maxRadius = Math.hypot(x, window.innerHeight);

      const opts: KeyframeAnimationOptions = {
        duration: 800,
        easing: "cubic-bezier(0.4, 0, 0.6, 1)",
        pseudoElement: "::view-transition-new(root)",
      };

      // Firefox needs fill:none to avoid end flicker
      if (!isFirefox) {
        opts.fill = "forwards";
      }

      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px 0px)`,
            `circle(${maxRadius}px at ${x}px 0px)`,
          ],
        },
        opts
      );
    });
  }, []);

  return { theme, resolvedTheme, setTheme };
}
