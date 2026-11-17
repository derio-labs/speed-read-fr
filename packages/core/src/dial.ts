/**
 * The position dial (spec section 13, R27): turns in px move the reading position in steps,
 * accelerating with turn speed, and coast briefly once input stops. Pure: time and frames are injected.
 */

/** Turn in px that moves one step at gain 1. */
export const PX_PER_STEP = 120;
export const MAX_GAIN = 14;
/** Input gap after which the dial coasts. */
export const COAST_AFTER_MS = 40;
/** Time constant of the coast's decay. */
export const COAST_TAU_MS = 190;
/** Coast rate cap, steps per second. */
export const MAX_COAST_RATE = 60;
/** Px of turn per px of pointer drag on the strip. */
export const DRAG_RATIO = 2.2;
/** After this long without input the readout returns to x1. */
const GAIN_RESET_MS = 400;
/** A coast slower than this (steps per second) has run out. */
const COAST_MIN_RATE = 0.6;
/** Longest frame interval the coast integrates over (a stalled tab does not jump). */
const MAX_FRAME_MS = 50;

/** Gain for a smoothed turn speed in px per ms. */
export const dialGain = (speed: number) => Math.min(MAX_GAIN, 1 + (speed / 1.2) ** 1.6);

export interface DialOptions {
  /** Move the position by whole steps; returns the steps actually moved (fewer at a document end). */
  onMove(steps: number): number;
  now(): number;
  requestFrame(fn: (time: number) => void): unknown;
  cancelFrame?(handle: unknown): void;
}

export interface Dial {
  /** Current multiplier (1 at rest). */
  readonly gain: number;
  /** A turn of `delta` px (positive is forward). */
  turn(delta: number): void;
  /** While held (a pointer drag in progress) the dial does not coast. */
  hold(held: boolean): void;
  /** Called whenever the multiplier changes. */
  onGain(fn: (gain: number) => void): void;
  destroy(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createDial(options: DialOptions): Dial {
  const { now } = options;
  let acc = 0;
  let speed = 0;
  let gain = 1;
  let spin = 0;
  let lastTurn = -Infinity;
  let lastFrame = 0;
  let held = false;
  let frame: unknown = null;
  let destroyed = false;
  const gainListeners: ((gain: number) => void)[] = [];

  function setGain(next: number) {
    if (next === gain) return;
    gain = next;
    for (const fn of gainListeners) fn(gain);
  }

  /** Bank `moved` steps and move by the whole ones; an end of the document drops what is banked. */
  function advance(moved: number) {
    acc += moved;
    const whole = acc > 0 ? Math.floor(acc) : Math.ceil(acc);
    if (whole === 0) return;
    acc -= whole;
    if (options.onMove(whole) !== whole) {
      acc = 0;
      spin = 0;
    }
  }

  function schedule() {
    if (frame === null && !destroyed) frame = options.requestFrame(tick);
  }

  function tick() {
    frame = null;
    if (destroyed) return;
    const t = now();
    const dt = Math.min(MAX_FRAME_MS, Math.max(0, t - lastFrame));
    lastFrame = t;
    const idle = t - lastTurn;
    if (idle > COAST_AFTER_MS && !held && Math.abs(spin) > COAST_MIN_RATE) {
      advance((spin * dt) / 1000);
      spin *= Math.exp(-dt / COAST_TAU_MS);
    } else if (idle > COAST_AFTER_MS) {
      spin = 0;
      if (idle > GAIN_RESET_MS) {
        speed = 0;
        setGain(1);
        return; // At rest: no more frames until the next turn.
      }
    }
    schedule();
  }

  return {
    get gain() {
      return gain;
    },
    turn(delta) {
      if (destroyed || !Number.isFinite(delta) || delta === 0) return;
      const t = now();
      // A turn after a rest starts slow, whether or not a frame noticed the rest.
      if (t - lastTurn > GAIN_RESET_MS) speed = 0;
      const dt = clamp(t - lastTurn, 8, 250);
      speed = 0.6 * speed + (0.4 * Math.abs(delta)) / dt;
      setGain(dialGain(speed));
      const moved = (delta * gain) / PX_PER_STEP;
      // Reversing drops what was banked the other way, so a turn back moves back at once.
      if (acc * moved < 0) acc = 0;
      spin = clamp(((moved / dt) * 1000) / 2, -MAX_COAST_RATE, MAX_COAST_RATE);
      lastTurn = t;
      lastFrame = t;
      advance(moved);
      schedule();
    },
    hold(next) {
      held = next;
      if (!next) lastFrame = now();
    },
    onGain(fn) {
      gainListeners.push(fn);
    },
    destroy() {
      destroyed = true;
      if (frame !== null) options.cancelFrame?.(frame);
      frame = null;
    },
  };
}
