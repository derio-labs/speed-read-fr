// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ARTICLE, mountHarness } from '../testing/reader';

afterEach(() => {
  document.body.innerHTML = '';
});

const rows = (t: ReturnType<typeof mountHarness>) => t.qa<HTMLButtonElement>('.sr-outline-row');
const fill = (row: Element) => (row.querySelector('.sr-row-fill') as HTMLElement).style.width;
const time = (row: Element) => row.querySelector('.sr-row-time')!.textContent;

describe('outline rail', () => {
  it('has one row per headed section, indented by level', () => {
    const t = mountHarness(`<p>Untitled intro.</p>${ARTICLE}`);
    expect(rows(t).map((r) => r.querySelector('.sr-row-title')!.textContent)).toEqual(['Guide', 'Setup', 'Details', 'Usage']);
    expect(rows(t).map((r) => r.dataset.level)).toEqual(['1', '2', '3', '2']);
    expect(rows(t).map((r) => r.style.getPropertyValue('--sr-level'))).toEqual(['1', '2', '3', '2']);
  });

  it('marks the current row with aria-current', () => {
    const t = mountHarness(ARTICLE);
    expect(rows(t)[0].getAttribute('aria-current')).toBe('true');
    t.handle.player.section(1);
    expect(rows(t).map((r) => r.getAttribute('aria-current'))).toEqual([null, 'true', null, null]);
  });

  it('updates each row’s progress bar and remaining time on step', () => {
    const t = mountHarness(ARTICLE, { settings: { chunkWords: 1 } });
    const [guide, setup] = rows(t);
    expect(fill(guide)).toBe('0%');
    const before = time(guide);
    expect(before).toMatch(/^\d+ (s|min)$/);
    t.handle.player.toggle();
    t.handle.player.continue();
    t.clock.advance(t.clock.nextIn()!);
    t.clock.advance(t.clock.nextIn()!);
    expect(parseFloat(fill(guide))).toBeGreaterThan(0);
    expect(parseFloat(fill(guide))).toBeLessThan(100);
    t.handle.player.section(1);
    expect(fill(guide)).toBe('100%');
    expect(time(guide)).toBe('done');
    expect(fill(setup)).toBe('0%');
  });

  it('jumps to the section when a row is pressed, and keeps focus in the reader', () => {
    const t = mountHarness(ARTICLE);
    const usage = t.doc.sections.find((s) => s.heading?.text === 'Usage')!;
    rows(t)[3].click();
    expect(rows(t)[3].getAttribute('aria-current')).toBe('true');
    expect(t.host.onPosition).toHaveBeenLastCalledWith(usage.heading!.source);
    expect(document.activeElement).toBe(t.reader);
  });
});

describe('remaining times follow the speed', () => {
  const seconds = (row: Element) => {
    const t = time(row)!;
    return t.endsWith(' min') ? parseFloat(t) * 60 : parseFloat(t);
  };

  it('recompute when only the speed changes', () => {
    const t = mountHarness(ARTICLE);
    const usage = rows(t)[3];
    const before = seconds(usage);
    t.handle.player.setSpeed(1000);
    expect(seconds(usage)).toBeLessThan(before);
    t.handle.player.setSpeed(100);
    expect(seconds(usage)).toBeGreaterThan(before);
  });

  it('use the speed loaded from the store', async () => {
    const plain = mountHarness(ARTICLE);
    const before = seconds(rows(plain)[3]);
    const t = mountHarness(ARTICLE, { saved: { wpm: 1000 } });
    await t.settle();
    expect(seconds(rows(t)[3])).toBeLessThan(before);
  });
});

describe('outline bar (narrow layout)', () => {
  it('shows the current heading and opens the rail as a drawer', () => {
    const t = mountHarness(ARTICLE);
    const toggle = t.q<HTMLButtonElement>('.sr-outline-toggle')!;
    const layout = t.q('.sr-layout')!;
    expect(toggle.textContent).toBe('Guide');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(layout.dataset.drawer).toBe('open');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    rows(t)[1].click();
    expect(layout.dataset.drawer).toBeUndefined();
    expect(toggle.textContent).toBe('Setup');
  });
});
