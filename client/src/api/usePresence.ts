import { useEffect } from 'react';
import { presenceApi } from './presence';

const INTERVAL_MS = 60_000;

// Presence heartbeat for employee-role users: one immediately when the tab is (or becomes) visible, then
// every 60 s while it stays visible; nothing while hidden. The server decides what that means (online =
// punched in + a heartbeat within 5 minutes). Mounted once, in the staff layout.
export function usePresence(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const beat = () => {
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
