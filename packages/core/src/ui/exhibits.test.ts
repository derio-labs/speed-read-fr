// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
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
