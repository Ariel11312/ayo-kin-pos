import { useState, useEffect } from "react";

/* Single source of truth for the phone/tablet breakpoint.
   Listens to matchMedia so rotation and resize re-render immediately. */
export const MOBILE_BP = 820;

export default function useIsMobile(bp = MOBILE_BP) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= bp
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${bp}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [bp]);

  return isMobile;
}

// iOS zooms the page when a focused input's font-size is under 16px.
export const noZoomFont = (isMobile) => (isMobile ? 16 : 13);

export const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";