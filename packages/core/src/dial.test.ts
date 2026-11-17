import { describe, expect, it } from 'vitest';
import { COAST_AFTER_MS, createDial, dialGain, MAX_GAIN, PX_PER_STEP } from './dial';

/** A fake clock and frame queue: `run(ms)` advances time in 16 ms frames, running queued frames. */
function setup(limit = { min: -Infinity, max: Infinity }) {
  let time = 1000;
  let frames: ((t: number) => void)[] = [];
  let position = 0;
  const moves: number[] = [];
  const dial = createDial({
    now: () => time,
    requestFrame: (fn) => {
      frames.push(fn);
      return frames.length;
    },
    onMove(steps) {
      const to = Math.max(limit.min, Math.min(limit.max, position + steps));
      const moved = to - position;
      position = to;
      moves.push(moved);
      return moved;
    },
  });
  const frame = () => {
    const due = frames;
    frames = [];
    for (const fn of due) fn(time);
  };
  return {
    dial,
    moves,
    get position() {
      return position;
    },
    get pendingFrames() {
      return frames.length;
    },
    /** Advance time by `ms`, running frames every 16 ms. */
    run(ms: number) {
      for (let left = ms; left > 0; left -= 16) {
        time += Math.min(16, left);
        frame();
      }
    },
    /** Advance time without frames (between turns of a fast burst). */
    skip(ms: number) {
      time += ms;
    },
  };
}

describe('dial: the turn formula (spec section 13)', () => {
  it('gain is 1 + (speed / 1.2)^1.6, capped at 14', () => {
    expect(dialGain(0)).toBe(1);
    expect(dialGain(1.2)).toBeCloseTo(2);
    expect(dialGain(2.4)).toBeCloseTo(1 + 2 ** 1.6);
    expect(dialGain(100)).toBe(MAX_GAIN);
    expect(MAX_GAIN).toBe(14);
    expect(PX_PER_STEP).toBe(120);
  });

  it('follows dt clamp 8-250, speed smoothing 0.6/0.4 and accumulates fractions', () => {
    const t = setup();
    // First turn: dt clamped to 250 (no earlier turn), speed = 0.4 * 60 / 250.
    t.skip(1000);
    t.dial.turn(60);
    let speed = (0.4 * 60) / 250;
    expect(t.dial.gain).toBeCloseTo(dialGain(speed));
    let acc = (60 * dialGain(speed)) / 120;
    expect(t.position).toBe(Math.floor(acc));
    // 2 ms later: dt clamped to 8.
    t.skip(2);
    t.dial.turn(60);
    speed = 0.6 * speed + (0.4 * 60) / 8;
    expect(t.dial.gain).toBeCloseTo(dialGain(speed));
    acc += (60 * dialGain(speed)) / 120;
    expect(t.position).toBe(Math.floor(acc));
    // 100 ms later: dt = 100.
    t.skip(100);
    t.dial.turn(30);
    speed = 0.6 * speed + (0.4 * 30) / 100;
    acc += (30 * dialGain(speed)) / 120;
    expect(t.dial.gain).toBeCloseTo(dialGain(speed));
    expect(t.position).toBe(Math.floor(acc));
  });

  it('a slow turn (100 px every 200 ms) moves about one step per turn', () => {
    const t = setup();
    for (let i = 0; i < 10; i++) {
      t.dial.turn(100);
      t.run(200);
    }
    t.run(2000);
    expect(t.position).toBeGreaterThanOrEqual(9);
    expect(t.position).toBeLessThanOrEqual(15);
    expect(Math.max(...t.moves)).toBeLessThanOrEqual(2);
  });

  it('turns 20 ms apart reach a gain above 8 and never above 14', () => {
    const t = setup();
    const gains: number[] = [];
    for (let i = 0; i < 30; i++) {
      t.dial.turn(100);
      gains.push(t.dial.gain);
      t.skip(20);
    }
    expect(Math.max(...gains)).toBeGreaterThan(8);
    expect(Math.max(...gains)).toBeLessThanOrEqual(14);
    // A huge burst still never exceeds 14.
    for (let i = 0; i < 10; i++) {
      t.dial.turn(2000);
      expect(t.dial.gain).toBeLessThanOrEqual(14);
      t.skip(8);
    }
  });

  it('a fast burst travels further per pixel than slow turns', () => {
    const slow = setup();
    for (let i = 0; i < 6; i++) {
      slow.dial.turn(100);
      slow.run(250);
    }
    slow.run(2000);
    const fast = setup();
    for (let i = 0; i < 6; i++) {
      fast.dial.turn(100);
      fast.skip(20);
    }
    fast.run(2000);
    expect(fast.position).toBeGreaterThan(slow.position * 2);
  });

  it('negative turns move backwards', () => {
    const t = setup();
    t.dial.turn(-130);
    expect(t.position).toBe(-1);
    t.run(2000);
    expect(t.position).toBeLessThanOrEqual(-1);
    expect(t.moves.every((m) => m < 0)).toBe(true);
  });
});

describe('dial: direction', () => {
  it('a turn back drops the fraction banked forwards and moves back at once', () => {
    const t = setup();
    t.dial.turn(200); // about 1.7 steps forwards: 1 moved, a fraction banked
    expect(t.position).toBe(1);
    t.skip(1000);
    t.dial.turn(-130);
    expect(t.position).toBe(0);
  });
});

describe('dial: coast', () => {
  it('keeps moving at half the last rate after 40 ms without input, decays (190 ms) and stops', () => {
    const t = setup();
    for (let i = 0; i < 8; i++) {
      t.dial.turn(100);
      t.skip(20);
    }
    const atRelease = t.position;
    t.run(COAST_AFTER_MS - 20 - 1);
    expect(t.position).toBe(atRelease);
    t.run(300);
    const after300 = t.position;
    expect(after300).toBeGreaterThan(atRelease);
    t.run(3000);
    const settled = t.position;
    // The coast ran out: no more frames are requested and the position no longer changes.
    expect(t.pendingFrames).toBe(0);
    t.run(1000);
    expect(t.position).toBe(settled);
    // Rate capped at 60 steps/s, decaying with tau 190 ms: the coast covers at most 60 * 0.19 steps (+1 rounding).
    expect(settled - atRelease).toBeLessThanOrEqual(Math.ceil(60 * 0.19) + 1);
  });

  it('does not coast while held, and coasts once released', () => {
    const t = setup();
    t.dial.hold(true);
    for (let i = 0; i < 8; i++) {
      t.dial.turn(100);
      t.skip(20);
    }
    const held = t.position;
    t.run(500);
    expect(t.position).toBe(held);
    for (let i = 0; i < 6; i++) {
      t.dial.turn(100);
      t.skip(20);
    }
    t.dial.hold(false);
    const released = t.position;
    t.run(1000);
    expect(t.position).toBeGreaterThan(released);
  });

  it('resets the readout to x1 once input has stopped', () => {
    const t = setup();
    const gains: number[] = [];
    const dial = t.dial;
    dial.onGain((g) => gains.push(g));
    for (let i = 0; i < 5; i++) {
      dial.turn(100);
      t.skip(20);
    }
    expect(dial.gain).toBeGreaterThan(2);
    t.run(3000);
    expect(dial.gain).toBe(1);
    expect(gains.at(-1)).toBe(1);
  });
});

describe('dial: document ends', () => {
  it('hitting either end zeroes the accumulator and the coast', () => {
    const t = setup({ min: 0, max: 5 });
    for (let i = 0; i < 6; i++) {
      t.dial.turn(200);
      t.skip(20);
    }
    expect(t.position).toBe(5);
    t.run(2000);
    expect(t.pendingFrames).toBe(0);
    // A small turn back moves at once: nothing was banked against the end.
    t.skip(1000);
    t.dial.turn(-130);
    expect(t.position).toBe(4);
    for (let i = 0; i < 6; i++) {
      t.dial.turn(-300);
      t.skip(20);
    }
    expect(t.position).toBe(0);
    t.skip(1000);
    t.dial.turn(130);
    expect(t.position).toBe(1);
  });

  it('destroy stops the coast', () => {
    const t = setup();
    for (let i = 0; i < 8; i++) {
      t.dial.turn(100);
      t.skip(20);
    }
    t.dial.destroy();
    const at = t.position;
    t.run(1000);
    expect(t.position).toBe(at);
    t.dial.turn(500);
    expect(t.position).toBe(at);
  });
});
