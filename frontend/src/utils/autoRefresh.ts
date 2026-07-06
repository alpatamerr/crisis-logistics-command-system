import { useState, useEffect, useRef, useCallback } from "react";

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

/**
 * Hook that provides an auto-refresh key and countdown timer.
 * Components can use `refreshKey` as a dependency to trigger re-fetches.
 */
export function useAutoRefresh() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(REFRESH_INTERVAL / 1000);
  const intervalRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    setSecondsUntilRefresh(REFRESH_INTERVAL / 1000);
  }, []);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      refresh();
    }, REFRESH_INTERVAL);

    countdownRef.current = window.setInterval(() => {
      setSecondsUntilRefresh(s => (s > 0 ? s - 1 : REFRESH_INTERVAL / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current) { window.clearInterval(intervalRef.current); }
      if (countdownRef.current) { window.clearInterval(countdownRef.current); }
    };
  }, [refresh]);

  return { refreshKey, secondsUntilRefresh, refresh };
}
