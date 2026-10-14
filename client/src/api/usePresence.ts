import { useEffect } from 'react';
import { presenceApi } from './presence';

const INTERVAL_MS = 60_000;
// Becoming visible sends a beat at once, but never sooner than this after the previous one
// (rapid tab switching would otherwise hit the server's rate limit).
const MIN_GAP_MS = 30_000;

// Presence heartbeat for employee-role users: one immediately when the tab is (or becomes) visible, then
// every 60 s while it stays visible; nothing while hidden. The server decides what that means (online =
// punched in + a heartbeat within 5 minutes). Mounted once, in the staff layout.
export function usePresence(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastSent = 0;

    const beat = () => {
      // Elapsed time between our own beats only (monotonic); never used as "the time".
      const sentAt = performance.now();
      if (lastSent && sentAt - lastSent < MIN_GAP_MS) return;
      lastSent = sentAt;
      presenceApi.heartbeat().catch(() => {
        // Best effort: a missed beat only makes the employee show as "available" for a while.
      });
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const sync = () => {
      if (document.visibilityState === 'visible') {
        if (timer) return;
        beat();
        timer = setInterval(beat, INTERVAL_MS);
      } else {
        stop();
      }
    };

    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      stop();
    };
  }, [enabled]);
}
