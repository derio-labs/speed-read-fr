import { createCloneMap, type CloneMap, type Host, type HostDocument, type SourceRef } from '@speed-read/core';

/** What an element that cannot be cloned safely is replaced by (spec section 7 Mount and styling). */
export const PLACEHOLDER_TEXT = 'Shown on the page';
/** The outer wrapper of every clone: a custom element name no page rule targets. */
export const CLONE_TAG = 'sr-clone';

/** Elements that would reload or request something when cloned. */
const EMBEDDED = new Set(['iframe', 'video', 'audio', 'object', 'embed', 'frame']);
const SHELL_ATTRIBUTES = new Set(['class', 'dir', 'lang']);
const INHERITED = ['color', 'font-family', 'font-size', 'line-height', 'text-align', 'direction'] as const;
/** Attributes that would act (navigate, submit, focus) or collide with the page's ids and form groups. */
const STRIPPED_ATTRIBUTES = new Set(['id', 'name', 'autofocus', 'action', 'formaction']);
const URL_ATTRIBUTES = ['href', 'src', 'xlink:href'];
/** Attributes holding id references, dropped when their target id was stripped from the clone. */
const IDREF_ATTRIBUTES = ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'aria-flowto', 'headers', 'list', 'form'];
/** A press on these inside a clone would navigate or submit: it is prevented (it still moves the reader). */
const ACTIVE = 'a[href], area[href], button, input, select, textarea, label, summary, form';

const important = (declarations: string) =>
  declarations
    .split(';')
    .filter(Boolean)
    .map((d) => `${d} !important`)
    .join(';');
/** Shell copies keep their tags and classes for ancestor-dependent rules, but not their page layout or box. */
const SHELL_LAYOUT = important(
  'display:block;position:static;float:none;margin:0;padding:0;border:0;width:auto;min-width:0;max-width:none;height:auto;min-height:0;max-height:none;inset:auto;transform:none;opacity:1;overflow:visible',
);
const WRAPPER_STYLE = important(
  'display:block;position:static;box-sizing:border-box;width:auto;max-width:100%;margin:0;padding:12px 16px;border:0;overflow:auto;border-radius:8px;transform:none;opacity:1',
);
const PLACEHOLDER_STYLE =
  'display:block;box-sizing:border-box;padding:12px;border:1px dashed currentColor;border-radius:6px;opacity:0.7;font:italic 14px/1.4 system-ui,sans-serif;text-align:center';
const PRESS_EVENTS = ['click', 'auxclick', 'submit'];

export interface BrowserHostOptions {
  onPosition?(ref: SourceRef): void;
  onClose?(): void;
}

let hostCount = 0;

const isTransparent = (color: string) => !color || color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color);

/** Remove what would act or collide from a copied element; returns the id it had, if any. */
function neutralise(copy: Element): string | null {
  const id = copy.getAttribute('id');
  for (const attr of [...copy.attributes]) {
    const name = attr.name.toLowerCase();
    if (STRIPPED_ATTRIBUTES.has(name) || name.startsWith('on')) copy.removeAttribute(attr.name);
    else if (URL_ATTRIBUTES.includes(name) && /^\s*javascript:/i.test(attr.value)) copy.removeAttribute(attr.name);
  }
  return id;
}

/** Drop references to ids that were stripped from the clone. */
function dropStrippedRefs(root: Element, stripped: Set<string>) {
  if (stripped.size === 0) return;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of IDREF_ATTRIBUTES) {
      const value = el.getAttribute(attr);
      if (value === null) continue;
      const kept = value.split(/\s+/).filter((token) => token && !stripped.has(token));
      if (kept.length === 0) el.removeAttribute(attr);
      else el.setAttribute(attr, kept.join(' '));
    }
  }
}

/**
 * The browser `Host` (R16): every exhibit or document view is a uniquely named `<slot>` returned to
 * the core, with a clone of the page content placed in `hostElement`'s light DOM under that slot
 * name, where the page's stylesheet rules still match it. Clones are inert: they carry no ids,
 * names, handlers or script URLs, and a press on a link, button or form in them does nothing.
 */
export function createBrowserHost(hostElement: Element, container: Element, opts: BrowserHostOptions = {}): Host {
  const doc = hostElement.ownerDocument;
  const win = doc.defaultView;
  const prefix = `sr-${++hostCount}-${Math.random().toString(36).slice(2, 8)}`;
  let slotCount = 0;
  const placed = new Map<Node, Element>();

  for (const type of PRESS_EVENTS) {
    hostElement.addEventListener(
      type,
      (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (target?.closest(CLONE_TAG) && target.closest(ACTIVE)) e.preventDefault();
      },
      true,
    );
  }

  const computed = (el: Element) => win?.getComputedStyle(el);

  function placeholder(): HTMLElement {
    const el = doc.createElement('div');
    el.setAttribute('data-sr-placeholder', '');
    el.style.cssText = PLACEHOLDER_STYLE;
    el.textContent = PLACEHOLDER_TEXT;
    return el;
  }

  /** A deep copy of `el`, made safe to show, with every copied element paired to its original in `map`. */
  function cloneSafe(el: Element, map?: CloneMap): Element {
    const stripped = new Set<string>();
    const walk = (orig: Element): Element => {
      const tag = orig.localName;
      let copy: Element;
      // A canvas is never read (l-security-r1): its pixels may be cross-origin, which an extension
      // with host permission can read in Firefox, and the copy lives in page-readable light DOM.
      if (EMBEDDED.has(tag) || tag === 'canvas' || orig.shadowRoot) copy = placeholder();
      else {
        copy = orig.cloneNode(false) as Element;
        const id = neutralise(copy);
        if (id) stripped.add(id);
        for (const child of orig.childNodes) copy.appendChild(child.nodeType === 1 ? walk(child as Element) : child.cloneNode(true));
        if (tag === 'img' || tag === 'svg') {
          (copy as HTMLElement).style.maxWidth = '100%';
          if (tag === 'img') (copy as HTMLElement).style.height = 'auto';
        }
      }
      map?.pair(orig, copy);
      return copy;
    };
    const copy = walk(el);
    dropStrippedRefs(copy, stripped);
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
    const wrapper = doc.createElement(CLONE_TAG);
    wrapper.setAttribute('data-sr-clone', '');
    wrapper.style.cssText = WRAPPER_STYLE;
    const style = computed(container);
    for (const prop of INHERITED) {
      const value = style?.getPropertyValue(prop);
      if (value) wrapper.style.setProperty(prop, value);
    }
    wrapper.style.setProperty('background-color', background(), 'important');
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
      const map = createCloneMap([container]);
      const node = place(wrap(container, cloneSafe(container, map)));
      return { node, locate: map.locate, refAt: map.refAt };
    },
    release(node) {
      placed.get(node)?.remove();
      placed.delete(node);
    },
    onPosition: (ref) => opts.onPosition?.(ref),
    onClose: () => opts.onClose?.(),
  };
}
