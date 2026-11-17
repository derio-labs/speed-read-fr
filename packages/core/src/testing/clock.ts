import type { Scheduler } from '../player';

/** A scheduler the test steps by hand. */
export interface FakeClock extends Scheduler {
  /** Run every timer due within the next `ms` milliseconds, in order. */
  advance(ms: number): void;
  /** Number of timers waiting. */
  pending(): number;
  /** Milliseconds until the next timer fires, or null when none waits. */
  nextIn(): number | null;
}

export function fakeClock(): FakeClock {
  let time = 0;
  let nextId = 1;
  let timers: { id: number; at: number; fn: () => void }[] = [];
  const next = () => timers.reduce<(typeof timers)[number] | null>((a, t) => (!a || t.at < a.at ? t : a), null);
  return {
    now: () => time,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.push({ id, at: time + ms, fn });
      return id;
    },
    clearTimeout(handle) {
      timers = timers.filter((t) => t.id !== handle);
    },
    advance(ms) {
      const end = time + ms;
      for (let t = next(); t && t.at <= end; t = next()) {
        timers = timers.filter((x) => x !== t);
        time = t.at;
        t.fn();
      }
      time = end;
    },
    pending: () => timers.length,
    nextIn() {
      const t = next();
      return t ? t.at - time : null;
    },
  };
}
