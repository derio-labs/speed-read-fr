// @vitest-environment jsdom
import type { ExhibitBlock } from '@speed-read/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserHost, PLACEHOLDER_TEXT } from './host';

function setup(inner: string) {
  document.body.innerHTML = `
    <div class="page dark" id="page" data-theme="night" dir="ltr" lang="en" title="t" style="background-color: rgb(10, 20, 30)">
      <section class="post">
        <div id="content" style="color: rgb(200, 210, 220); font-family: Georgia; font-size: 18px; line-height: 27px; text-align: left; direction: ltr">
          ${inner}
        </div>
      </section>
    </div>`;
  const hostElement = document.createElement('div');
  hostElement.attachShadow({ mode: 'open' });
  document.body.append(hostElement);
  const container = document.getElementById('content')!;
  const onPosition = vi.fn();
  const onClose = vi.fn();
  const host = createBrowserHost(hostElement, container, { onPosition, onClose });
  return { hostElement, container, host, onPosition, onClose };
}

const block = (el: Element | null, kind: ExhibitBlock['kind'] = 'code'): ExhibitBlock => ({ kind, meta: {}, source: { element: el } });

/** The light-DOM clone placed for a slot. */
const placed = (hostElement: Element, slot: Node) => hostElement.querySelector(`:scope > [slot="${(slot as HTMLSlotElement).name}"]`) as HTMLElement;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('exhibit', () => {
  it('returns a uniquely named slot and places a clone with that slot name in the light DOM', () => {
    const { hostElement, host } = setup('<pre class="hl" id="code"><span class="kw">let</span> x</pre>');
    const slot = host.exhibit(block(document.getElementById('code')), 'pane');
    expect(slot).toBeInstanceOf(HTMLSlotElement);
    const name = (slot as HTMLSlotElement).name;
    expect(name).toBeTruthy();
    const wrapper = placed(hostElement, slot);
    expect(wrapper).not.toBeNull();
    const pre = wrapper.querySelector('pre.hl')!;
    expect(pre.innerHTML).toBe('<span class="kw">let</span> x');
    expect(pre).not.toBe(document.getElementById('code'));
  });

  it('wraps the clone in shallow ancestor copies up to but excluding body, without ids', () => {
    const { hostElement, host } = setup('<pre id="code">x</pre>');
    const wrapper = placed(hostElement, host.exhibit(block(document.getElementById('code')), 'pane'));
    const page = wrapper.firstElementChild as HTMLElement;
    expect(page.tagName).toBe('DIV');
    expect(page.className).toBe('page dark');
    expect(page.dataset.theme).toBe('night');
    expect(page.getAttribute('dir')).toBe('ltr');
    expect(page.getAttribute('lang')).toBe('en');
    expect(page.hasAttribute('id')).toBe(false);
    expect(page.hasAttribute('title')).toBe(false);
    const section = page.firstElementChild!;
    expect(section.className).toBe('post');
    const content = section.firstElementChild!;
    expect(content.hasAttribute('id')).toBe(false);
    expect(content.firstElementChild!.tagName).toBe('PRE');
    expect(content.children).toHaveLength(1);
    expect(wrapper.querySelectorAll('body, [id="page"], [id="content"]')).toHaveLength(0);
  });

  it("gives the outer wrapper the container's inherited properties and the first non-transparent background", () => {
    const { hostElement, host } = setup('<pre id="code">x</pre>');
    const wrapper = placed(hostElement, host.exhibit(block(document.getElementById('code')), 'pane'));
    expect(wrapper.style.color).toBe('rgb(200, 210, 220)');
    expect(wrapper.style.fontFamily).toBe('Georgia');
    expect(wrapper.style.fontSize).toBe('18px');
    expect(wrapper.style.lineHeight).toBe('27px');
    expect(wrapper.style.textAlign).toBe('left');
    expect(wrapper.style.direction).toBe('ltr');
    expect(wrapper.style.backgroundColor).toBe('rgb(10, 20, 30)');
  });

  it('gives two calls for one block two independent clones, and release removes each', () => {
    const { hostElement, host } = setup('<pre id="code">x</pre>');
    const b = block(document.getElementById('code'));
    const a = host.exhibit(b, 'pane');
    const c = host.exhibit(b, 'expanded');
    expect((a as HTMLSlotElement).name).not.toBe((c as HTMLSlotElement).name);
    const wa = placed(hostElement, a);
    const wc = placed(hostElement, c);
    expect(wa).not.toBe(wc);
    host.release(a);
    expect(wa.isConnected).toBe(false);
    expect(wc.isConnected).toBe(true);
    host.release(c);
    expect(hostElement.children).toHaveLength(0);
  });

  it('replaces a canvas by an image of its pixels', () => {
    const { hostElement, host } = setup('<figure id="fig"><canvas width="40" height="20" class="chart"></canvas></figure>');
    const canvas = document.querySelector('canvas')!;
    canvas.toDataURL = () => 'data:image/png;base64,AAAA';
    const wrapper = placed(hostElement, host.exhibit(block(document.getElementById('fig'), 'image'), 'pane'));
    expect(wrapper.querySelector('canvas')).toBeNull();
    const img = wrapper.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(img.className).toBe('chart');
    expect(img.getAttribute('width')).toBe('40');
  });

  it('shows a placeholder for a tainted canvas', () => {
    const { hostElement, host } = setup('<canvas id="c"></canvas>');
    const canvas = document.getElementById('c') as HTMLCanvasElement;
    canvas.toDataURL = () => {
      throw new Error('SecurityError');
    };
    const wrapper = placed(hostElement, host.exhibit(block(canvas, 'image'), 'pane'));
    expect(wrapper.querySelector('canvas, img')).toBeNull();
    expect(wrapper.textContent).toContain(PLACEHOLDER_TEXT);
  });

  it.each(['iframe', 'video', 'audio', 'object', 'embed'])('replaces %s inside a clone by a placeholder', (tag) => {
    const { hostElement, host } = setup(`<figure id="fig"><${tag} src="https://example.invalid/x"></${tag}><figcaption>cap</figcaption></figure>`);
    const wrapper = placed(hostElement, host.exhibit(block(document.getElementById('fig'), 'image'), 'pane'));
    expect(wrapper.querySelector(tag)).toBeNull();
    expect(wrapper.querySelector('[data-sr-placeholder]')?.textContent).toBe(PLACEHOLDER_TEXT);
    expect(wrapper.querySelector('figcaption')?.textContent).toBe('cap');
  });

  it('replaces an element with a shadow root by a placeholder', () => {
    const { hostElement, host } = setup('<div id="d"><p>text</p><x-widget></x-widget></div>');
    document.querySelector('x-widget')!.attachShadow({ mode: 'open' }).innerHTML = '<b>inside</b>';
    const wrapper = placed(hostElement, host.exhibit(block(document.getElementById('d'), 'diagram'), 'pane'));
    expect(wrapper.querySelector('x-widget')).toBeNull();
    expect(wrapper.querySelector('[data-sr-placeholder]')).not.toBeNull();
    expect(wrapper.querySelector('p')?.textContent).toBe('text');
  });

  it('sizes images inside the clone to the pane', () => {
    const { hostElement, host } = setup('<figure id="fig"><img alt="a" src="data:image/png;base64,AAAA" width="900" height="300"></figure>');
    const wrapper = placed(hostElement, host.exhibit(block(document.getElementById('fig'), 'image'), 'pane'));
    expect(wrapper.querySelector('img')!.style.maxWidth).toBe('100%');
    expect(wrapper.style.maxWidth).toBe('100%');
  });

  it('places an empty wrapper for a block without an element', () => {
    const { hostElement, host } = setup('<p>x</p>');
    const slot = host.exhibit(block(null), 'pane');
    expect(placed(hostElement, slot).children).toHaveLength(0);
  });
});

describe('document', () => {
  it('returns a slot with the container cloned in the light DOM, and maps elements both ways', () => {
    const { hostElement, host } = setup('<p id="p1">One <em>two</em>.</p><ul><li id="l1">Item</li></ul>');
    const docView = host.document();
    expect(docView.node).toBeInstanceOf(HTMLSlotElement);
    const wrapper = placed(hostElement, docView.node);
    const p1 = document.getElementById('p1')!;
    const copy = docView.locate({ element: p1 })!;
    expect(copy).not.toBe(p1);
    expect(wrapper.contains(copy)).toBe(true);
    expect(copy.textContent).toBe('One two.');
    expect(docView.refAt(copy)?.element).toBe(p1);
    expect(docView.refAt(copy.querySelector('em')!)?.element).toBe(p1.querySelector('em'));
    expect(docView.refAt(wrapper)).toBeNull();
    expect(docView.locate({ element: null })).toBeNull();
    expect(docView.locate({ element: document.getElementById('page') })).toBeNull();
    // Ancestor shells around the container, like exhibits.
    expect(wrapper.querySelector('.page.dark > .post')).not.toBeNull();
    host.release(docView.node);
    expect(wrapper.isConnected).toBe(false);
  });

  it('reads the line number of a source element', () => {
    const { host } = setup('<p id="p1" data-line="7">x</p>');
    const docView = host.document();
    const p1 = document.getElementById('p1')!;
    expect(docView.refAt(docView.locate({ element: p1 })!)).toEqual({ element: p1, line: 7 });
  });
});

describe('callbacks', () => {
  it('passes position and close through', () => {
    const { host, onPosition, onClose } = setup('<p>x</p>');
    const ref = { element: document.querySelector('p') };
    host.onPosition(ref);
    host.onClose();
    expect(onPosition).toHaveBeenCalledWith(ref);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
