import { useState, useEffect } from "react";

/**
 * Tiny matchMedia hook — lets inline-style components react to viewport size
 * without needing a CSS file or a styling library.
 *
 * Suggested location: src/hooks/useMediaQuery.js
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange); // Safari < 14
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

/** Phones (and small split-screen windows) */
export const useIsMobile = () => useMediaQuery("(max-width: 640px)");

/** Tablets / narrow laptops — the point where 3-column dashboards break */
export const useIsTablet = () => useMediaQuery("(max-width: 1024px)");

export default useMediaQuery;