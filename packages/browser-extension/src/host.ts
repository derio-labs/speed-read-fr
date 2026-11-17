import type { Host, HostDocument, SourceRef } from '@speed-read/core';

/** What an element that cannot be cloned safely is replaced by (spec section 7 Mount and styling). */
export const PLACEHOLDER_TEXT = 'Shown on the page';

/** Elements that would reload or request something when cloned. */
const EMBEDDED = new Set(['iframe', 'video', 'audio', 'object', 'embed', 'frame']);
const SHELL_ATTRIBUTES = new Set(['class', 'dir', 'lang']);
const INHERITED = ['color', 'font-family', 'font-size', 'line-height', 'text-align', 'direction'] as const;
/** Shell copies keep their classes for ancestor-dependent rules, but not their page layout. */
const SHELL_LAYOUT =
  'display:block;position:static;float:none;margin:0;width:auto;min-width:0;max-width:none;height:auto;min-height:0;max-height:none;inset:auto;transform:none;overflow:visible';
const WRAPPER_STYLE = 'display:block;box-sizing:border-box;max-width:100%;margin:0;padding:12px 16px;overflow:auto;border-radius:8px';
const PLACEHOLDER_STYLE =
  'display:block;box-sizing:border-box;padding:12px;border:1px dashed currentColor;border-radius:6px;opacity:0.7;font:italic 14px/1.4 system-ui,sans-serif;text-align:center';

export interface BrowserHostOptions {
  onPosition?(ref: SourceRef): void;
  onClose?(): void;
}

let hostCount = 0;

const isTransparent = (color: string) => !color || color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color);

function refOf(el: Element): SourceRef {
  const line = Number.parseInt(el.getAttribute('data-line') ?? '', 10);
  return Number.isInteger(line) ? { element: el, line } : { element: el };
}

/**
 * The browser `Host` (R16): every exhibit or document view is a uniquely named `<slot>` returned to
 * the core, with a clone of the page content placed in `hostElement`'s light DOM under that slot
 * name, where the page's stylesheet rules still match it.
 */
export function createBrowserHost(hostElement: Element, container: Element, opts: BrowserHostOptions = {}): Host {
  const doc = hostElement.ownerDocument;
  const win = doc.defaultView;
  const prefix = `sr-${++hostCount}-${Math.random().toString(36).slice(2, 8)}`;
  let slotCount = 0;
  const placed = new Map<Node, Element>();

  const computed = (el: Element) => win?.getComputedStyle(el);

  function placeholder(): HTMLElement {
    const el = doc.createElement('div');
    el.setAttribute('data-sr-placeholder', '');
    el.style.cssText = PLACEHOLDER_STYLE;
    el.textContent = PLACEHOLDER_TEXT;
    return el;
  }

  function canvasImage(canvas: HTMLCanvasElement): Element {
    let src: string | undefined;
    try {
      src = canvas.toDataURL();
    } catch {
      src = undefined;
    }
    if (!src || !src.startsWith('data:')) return placeholder();
    const img = doc.createElement('img');
    for (const attr of ['class', 'width', 'height', 'style']) {
      const value = canvas.getAttribute(attr);
      if (value !== null) img.setAttribute(attr, value);
    }
    img.setAttribute('src', src);
    img.setAttribute('alt', canvas.getAttribute('aria-label') ?? '');
    return img;
  }

  /** A deep copy of `el`, made safe to show, with every copied element paired to its original. */
  function cloneSafe(el: Element, pairs?: { toCopy: Map<Element, Element>; toOriginal: WeakMap<Element, Element> }): Element {
    const tag = el.localName;
    let copy: Element;
    if (EMBEDDED.has(tag) || el.shadowRoot) copy = placeholder();
    else if (tag === 'canvas') copy = canvasImage(el as HTMLCanvasElement);
    else {
      copy = el.cloneNode(false) as Element;
      for (const child of el.childNodes) {
        copy.appendChild(child.nodeType === 1 ? cloneSafe(child as Element, pairs) : child.cloneNode(true));
      }
      if (tag === 'img' || tag === 'svg') {
        (copy as HTMLElement).style.maxWidth = '100%';
        if (tag === 'img') (copy as HTMLElement).style.height = 'auto';
      }
    }
    pairs?.toCopy.set(el, copy);
    pairs?.toOriginal.set(copy, el);
    return copy;
  }

  /** A shallow copy of an ancestor: tag, class, data-*, dir and lang, no id. */
  function shell(el: Element): Element {
    const copy = doc.createElementNS(el.namespaceURI, el.localName);
    for (const attr of el.attributes) {
      if (SHELL_ATTRIBUTES.has(attr.name) || attr.name.startsWith('data-')) copy.setAttribute(attr.name, attr.value);
    }
    (copy as HTMLElement).style.cssText = SHELL_LAYOUT;
    return copy;
  }

  function background(): string {
    for (let el: Element | null = container; el; el = el.parentElement) {
      const color = computed(el)?.backgroundColor ?? '';
      if (!isTransparent(color)) return color;
    }
    return '#ffffff';
  }

  /** The outer wrapper with the container's inherited look, shells of `source`'s ancestors, then `content`. */
  function wrap(source: Element | null, content: Element | null): HTMLElement {
    const wrapper = doc.createElement('div');
    wrapper.setAttribute('data-sr-clone', '');
    wrapper.style.cssText = WRAPPER_STYLE;
    const style = computed(container);
    for (const prop of INHERITED) {
      const value = style?.getPropertyValue(prop);
      if (value) wrapper.style.setProperty(prop, value);
    }
    wrapper.style.backgroundColor = background();
    let inner: Element = wrapper;
    if (source) {
      const ancestors: Element[] = [];
      for (let el = source.parentElement; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) ancestors.unshift(el);
      for (const ancestor of ancestors) inner = inner.appendChild(shell(ancestor));
    }
    if (content) inner.appendChild(content);
    return wrapper;
  }

  function place(wrapper: Element): HTMLSlotElement {
    const name = `${prefix}-${++slotCount}`;
    const slot = doc.createElement('slot');
    slot.name = name;
    wrapper.setAttribute('slot', name);
    hostElement.appendChild(wrapper);
    placed.set(slot, wrapper);
    return slot;
  }

  return {
    exhibit(block) {
      const el = block.source.element;
      return place(wrap(el, el ? cloneSafe(el) : null));
    },
    document(): HostDocument {
      const pairs = { toCopy: new Map<Element, Element>(), toOriginal: new WeakMap<Element, Element>() };
      const copy = cloneSafe(container, pairs);
      copy.removeAttribute('id');
      const node = place(wrap(container, copy));
      return {
        node,
        locate: (ref) => (ref.element ? (pairs.toCopy.get(ref.element) ?? null) : null),
        refAt(target) {
          for (let el: Element | null = target; el; el = el.parentElement) {
            const original = pairs.toOriginal.get(el);
            if (original && original !== container) return refOf(original);
          }
          return null;
        },
      };
    },
    release(node) {
      placed.get(node)?.remove();
      placed.delete(node);
    },
    onPosition: (ref) => opts.onPosition?.(ref),
    onClose: () => opts.onClose?.(),
  };
}
