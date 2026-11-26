// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';
import { mountHarness } from '../testing/reader';

afterEach(() => {
  document.body.innerHTML = '';
});

const paneItems = (t: ReturnType<typeof mountHarness>) => t.qa('.sr-exhibits .sr-exhibit');
const paneCalls = (t: ReturnType<typeof mountHarness>) => t.host.exhibit.mock.calls.filter(([, use]) => use === 'pane');

/** Run the player until it waits at a stop (or ends). */
function runToStop(t: ReturnType<typeof mountHarness>) {
  for (let i = 0; i < 200 && t.handle.player.state === 'playing'; i++) t.clock.advance(t.clock.nextIn() ?? 0);
}

describe('exhibit pane', () => {
  const DOC = '<p>Intro words are here.</p><pre id="code">a\nb</pre><p>After the code.</p>';

  it('requests a block’s node only when playback reaches it and marks it active', () => {
    const t = mountHarness(DOC);
    t.handle.player.toggle();
    expect(t.host.exhibit).not.toHaveBeenCalled();
    expect(paneItems(t)).toHaveLength(0);
    runToStop(t);
    expect(paneCalls(t)).toHaveLength(1);
    expect(paneCalls(t)[0][0]).toBe(t.doc.sections[0].blocks[1]);
    const [item] = paneItems(t);
    expect(item.querySelector('#code, pre')).not.toBeNull();
    expect(item.getAttribute('aria-current')).toBe('true');
    expect(item.textContent).toContain('Code');
  });

  it('keeps a passed exhibit visible and no longer active', () => {
    const t = mountHarness(DOC);
    t.handle.player.toggle();
    runToStop(t);
    t.handle.player.continue();
    expect(paneItems(t)).toHaveLength(1);
    expect(paneItems(t)[0].getAttribute('aria-current')).toBeNull();
    expect(paneCalls(t)).toHaveLength(1);
  });

  const TWO = '<h2>A</h2><pre>a</pre><p>x y.</p><h2>B</h2><p>y z.</p><table><tr><td>1</td></tr></table><p>end.</p>';

  it('releases and replaces its contents when the section changes', () => {
    const t = mountHarness(TWO, { settings: { stopLevels: [] } });
    t.handle.player.toggle();
    runToStop(t);
    const first = t.host.exhibit.mock.results[0].value as Node;
    t.handle.player.continue();
    runToStop(t);
    expect(t.host.release).toHaveBeenCalledWith(first);
    expect(paneItems(t)).toHaveLength(1);
    expect(paneItems(t)[0].querySelector('table')).not.toBeNull();
  });

  it('shows every exhibit of a section already read when it is revisited', () => {
    const t = mountHarness(TWO, { settings: { stopLevels: [] } });
    t.handle.player.toggle();
    runToStop(t);
    t.handle.player.continue();
    runToStop(t);
    t.handle.player.section(-1);
    expect(paneItems(t)).toHaveLength(1);
    expect(paneItems(t)[0].querySelector('pre')).not.toBeNull();
    expect(paneCalls(t)).toHaveLength(3);
  });

  it('reveals a skipped block when its position is passed', () => {
    const t = mountHarness(DOC, { settings: { code: { mode: 'skip', dwellSeconds: 5 } } });
    t.handle.player.toggle();
    expect(paneItems(t)).toHaveLength(0);
    for (let i = 0; i < 50 && paneItems(t).length === 0; i++) t.clock.advance(t.clock.nextIn() ?? 0);
    expect(paneItems(t)).toHaveLength(1);
    expect(t.handle.player.state).toBe('playing');
  });

  it('shows an empty note for a section with nothing revealed', () => {
    const t = mountHarness(DOC);
    expect(t.q('.sr-exhibits-empty')).not.toBeNull();
  });

  it('releases every pane node on destroy', () => {
    const t = mountHarness(DOC);
    t.handle.player.toggle();
    runToStop(t);
    expect(t.live.size).toBe(1);
    t.handle.destroy();
    expect(t.live.size).toBe(0);
  });
});

describe('newest-first pane (the browser dock)', () => {
  const THREE = '<p>one.</p><pre>a</pre><p>two.</p><pre>b</pre><p>three.</p><pre>c</pre><p>end.</p>';
  const order = (t: ReturnType<typeof mountHarness>) => paneItems(t).map((i) => i.dataset.key);
  const readAll = (t: ReturnType<typeof mountHarness>) => {
    t.handle.player.toggle();
    for (let i = 0; i < 3; i++) {
      runToStop(t);
      t.handle.player.continue();
    }
  };

  it('lists the latest exhibit first', () => {
    const t = mountHarness(THREE, { bottomStage: true, settings: { stopLevels: [] } });
    readAll(t);
    expect(order(t)).toEqual(['b5', 'b3', 'b1']);
  });

  it('keeps that order after a section re-entry re-adds every exhibit', () => {
    const t = mountHarness(`<h2>S</h2>${THREE}<h2>T</h2><p>next.</p>`, { bottomStage: true, settings: { stopLevels: [] } });
    readAll(t);
    runToStop(t);
    t.handle.player.continue();
    runToStop(t);
    t.handle.player.section(-1);
    expect(order(t)).toEqual(['b5', 'b3', 'b1']);
  });

  it('keeps that order when the earliest exhibit is added last', () => {
    const t = mountHarness(THREE, { bottomStage: true, settings: { stopLevels: [] } });
    readAll(t);
    const section = t.doc.sections[0];
    const all = t.handle.player.revealedExhibits(section.id);
    const spy = vi.spyOn(t.handle.player, 'revealedExhibits').mockReturnValue(all.slice(1));
    t.handle.applySettings({ ...DEFAULT_SETTINGS, stopLevels: [], chunkWords: 1 });
    expect(order(t)).toEqual(['b5', 'b3']);
    spy.mockRestore();
    t.handle.applySettings({ ...DEFAULT_SETTINGS, stopLevels: [], chunkWords: 2 });
    expect(order(t)).toEqual(['b5', 'b3', 'b1']);
  });

  it('lists in document order without the dock', () => {
    const t = mountHarness(THREE, { settings: { stopLevels: [] } });
    readAll(t);
    expect(order(t)).toEqual(['b1', 'b3', 'b5']);
  });
});

describe('expanded exhibit', () => {
  it('requests an expanded node into an overlay over the whole reader and releases it on close', () => {
    const t = mountHarness('<p>Intro.</p><pre>a\nb\nc</pre>');
    t.handle.player.toggle();
    runToStop(t);
    t.handle.player.expand();
    const call = t.host.exhibit.mock.calls.find(([, use]) => use === 'expanded');
    expect(call?.[0]).toBe(t.doc.sections[0].blocks[1]);
    const overlay = t.q('.sr-layout > .sr-expanded')!;
    expect(overlay.hidden).toBe(false);
    const node = t.host.exhibit.mock.results[t.host.exhibit.mock.calls.indexOf(call!)].value;
    expect(overlay.contains(node)).toBe(true);
    t.q<HTMLButtonElement>('.sr-expanded .sr-icon-button')!.click();
    expect(t.host.release).toHaveBeenCalledWith(node);
    expect(t.q('.sr-expanded')).toBeNull();
    expect(document.activeElement).toBe(t.reader);
  });

  it('is released on destroy', () => {
    const t = mountHarness('<p>Intro.</p><pre>a</pre>');
    t.handle.player.toggle();
    runToStop(t);
    t.handle.player.expand();
    t.handle.destroy();
    expect(t.live.size).toBe(0);
  });
});

describe('inline exhibits', () => {
  const LONG1 = 'first_long_identifier_name_here';
  const LONG2 = 'second_long_identifier_name_here';
  const INLINE = `<p>Call <code>${LONG1}</code> then <code>${LONG2}</code> now.</p><pre id="blk">x</pre><p>Done.</p>`;
  const flow = { readingMode: 'flow' as const };

  it('lists each long atom as its own item, keyed by identity, without asking the host', () => {
    const t = mountHarness(INLINE, { settings: flow });
    t.handle.player.toggle();
    runToStop(t);
    expect(paneItems(t)).toHaveLength(1);
    expect(paneItems(t)[0].dataset.key).toBe('b0i1');
    expect(paneItems(t)[0].getAttribute('aria-current')).toBe('true');
    expect(paneItems(t)[0].querySelector('pre > code')!.textContent).toBe(LONG1);
    expect(paneCalls(t)).toHaveLength(0);
    t.handle.player.continue();
    runToStop(t);
    expect(paneItems(t).map((i) => i.dataset.key)).toEqual(['b0i1', 'b0i2']);
    expect(paneItems(t).map((i) => i.getAttribute('aria-current'))).toEqual([null, 'true']);
    expect(paneItems(t)[1].querySelector('pre > code')!.textContent).toBe(LONG2);
  });

  it('orders block and inline exhibits by position and keeps block exhibits on the host', () => {
    const t = mountHarness(INLINE, { settings: flow });
    t.handle.player.toggle();
    for (let i = 0; i < 3; i++) {
      runToStop(t);
      t.handle.player.continue();
    }
    runToStop(t);
    expect(paneItems(t).map((i) => i.dataset.key)).toEqual(['b0i1', 'b0i2', 'b1']);
    expect(paneCalls(t)).toHaveLength(1);
    expect(paneCalls(t)[0][0]).toBe(t.doc.sections[0].blocks[1]);
  });

  it('lists a skipped inline exhibit once passed', () => {
    const t = mountHarness(INLINE, { settings: { ...flow, code: { mode: 'skip', dwellSeconds: 5 } } });
    t.handle.player.toggle();
    t.clock.advance(60_000);
    expect(paneItems(t).map((i) => i.dataset.key)).toEqual(['b0i1', 'b0i2', 'b1']);
  });

  it('E on an inline stop expands it in core: pre/code, no host call, released with the overlay', () => {
    const t = mountHarness(INLINE, { settings: flow });
    t.handle.player.toggle();
    runToStop(t);
    t.handle.player.expand();
    expect(t.host.exhibit.mock.calls.filter(([, use]) => use === 'expanded')).toHaveLength(0);
    const overlay = t.q('.sr-layout > .sr-expanded')!;
    expect(overlay.querySelector('pre > code')!.textContent).toBe(LONG1);
    t.q<HTMLButtonElement>('.sr-expanded .sr-icon-button')!.click();
    expect(t.q('.sr-expanded')).toBeNull();
  });

  it('keeps a passed inline exhibit listed and revealed when a setting other than speed rebuilds the timeline in flow', () => {
    const t = mountHarness(INLINE, { settings: flow });
    t.handle.player.toggle();
    runToStop(t);
    t.handle.player.continue();
    const id = t.doc.sections[0].id;
    expect(t.handle.player.revealedExhibits(id).map((e) => e.blockIndex)).toContain(0);
    t.handle.applySettings({ ...DEFAULT_SETTINGS, ...flow, code: { mode: 'dwell', dwellSeconds: 5 } });
    expect(t.handle.player.revealedExhibits(id).some((e) => e.inline && e.inlineIndex === 1)).toBe(true);
    expect(paneItems(t).map((i) => i.dataset.key)).toContain('b0i1');
  });

  it('tells equal inline keys of two sections apart', () => {
    const t = mountHarness(`<h3>A</h3><p>Call <code>${LONG1}</code> now.</p><h3>B</h3><p>Call <code>${LONG2}</code> now.</p>`, {
      settings: { ...flow, stopLevels: [] },
    });
    t.handle.player.toggle();
    runToStop(t);
    const [a, b] = t.doc.sections.map((s) => s.id);
    expect(t.handle.player.revealedExhibits(a)).toHaveLength(1);
    expect(t.handle.player.revealedExhibits(b)).toHaveLength(0);
    expect(paneItems(t).map((i) => i.querySelector('code')!.textContent)).toEqual([LONG1]);
  });

  it('drops the inline cards when the timeline is rebuilt without them (flow to chunk)', () => {
    const t = mountHarness(INLINE, { settings: flow });
    t.handle.player.toggle();
    runToStop(t);
    t.handle.player.continue();
    runToStop(t);
    expect(paneItems(t).map((i) => i.dataset.key)).toEqual(['b0i1', 'b0i2']);
    t.handle.applySettings({ ...DEFAULT_SETTINGS, readingMode: 'chunk' });
    expect(paneItems(t).filter((i) => i.dataset.key!.includes('i'))).toHaveLength(0);
  });

  it('names an inline exhibit by its chip number in the caption and the expanded view', () => {
    const t = mountHarness(INLINE, { settings: flow });
    t.handle.player.toggle();
    runToStop(t);
    t.handle.player.continue();
    runToStop(t);
    expect(paneItems(t).map((i) => i.querySelector('.sr-exhibit-kind')!.textContent)).toEqual(['Code 1', 'Code 2']);
    t.handle.player.expand();
    expect(t.q('.sr-expanded-title')!.textContent).toContain('Code 2');
  });

  it('shows math as its TeX source', () => {
    const t = mountHarness(`<p>See <span class="katex"><annotation encoding="application/x-tex">${'\\frac{a_{12345}}{b_{67890}}'}</annotation></span> here.</p>`, {
      settings: flow,
    });
    t.handle.player.toggle();
    runToStop(t);
    expect(paneItems(t)[0]?.querySelector('pre > code')?.textContent).toBe('\\frac{a_{12345}}{b_{67890}}');
  });
});
