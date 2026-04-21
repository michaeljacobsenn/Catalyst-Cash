import { useEffect, useState } from "react";

const FALLBACK_VIEWPORT = {
  width: 390,
  height: 844,
};

function readViewport() {
  if (typeof window === "undefined") return FALLBACK_VIEWPORT;
  return {
    width: window.innerWidth || FALLBACK_VIEWPORT.width,
    height: window.innerHeight || FALLBACK_VIEWPORT.height,
  };
}

export function useResponsiveLayout() {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncViewport = () => {
      setViewport(readViewport());
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);

    return () => {
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);

  const width = viewport.width;

  return {
    ...viewport,
    isCompactPhone: width <= 390,
    isNarrowPhone: width <= 430,
    isTablet: width >= 768,
    isLargeTablet: width >= 1024,
  };
}
