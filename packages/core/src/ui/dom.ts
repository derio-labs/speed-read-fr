/** Small DOM builders. Text is only ever written as text nodes: no document text reaches innerHTML. */

export type Child = Node | string | number | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | null | undefined>;

export type Build = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]) => HTMLElementTagNameMap[K];

/** An element builder bound to `doc`: `h('div', { class: 'x' }, 'text', child)`. */
export function builder(doc: Document): Build {
  return (tag, attrs = {}, ...children) => {
    const el = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === false || value === null || value === undefined) continue;
      el.setAttribute(name, value === true ? '' : String(value));
    }
    append(el, ...children);
    return el;
  };
}

export function append(parent: Node, ...children: Child[]) {
  const doc = parent.ownerDocument ?? (parent as Document);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : doc.createTextNode(String(child)));
  }
}

/** Replace all children of `parent`. */
export function replaceChildren(parent: Element, ...children: Child[]) {
  while (parent.firstChild) parent.firstChild.remove();
  append(parent, ...children);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A 20 px stroke icon from path data (static, ours: never document text). */
export function icon(doc: Document, paths: readonly string[]): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'sr-icon');
  for (const d of paths) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

export const ICONS = {
  gear: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  ],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
} as const;

const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Elements inside `container` that Tab can reach, in document order (the container first when focusable). */
export function focusables(container: HTMLElement): HTMLElement[] {
  const all = [container, ...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.matches(FOCUSABLE) && !(el as HTMLButtonElement).disabled && !el.closest('[hidden]'),
  );
  // With layout, skip what CSS hides (e.g. the narrow-layout bar in the wide layout).
  const laidOut = all.some((el) => el.getClientRects().length > 0);
  return laidOut ? all.filter((el) => el.getClientRects().length > 0) : all;
}

/**
 * The focused element as seen from `container`'s tree: inside a shadow root the document's
 * `activeElement` is the shadow host, so the root node's own `activeElement` is read instead.
 */
export function activeIn(container: Node): Element | null {
  const root = container.getRootNode() as Document | ShadowRoot;
  return ('activeElement' in root ? root.activeElement : null) ?? container.ownerDocument?.activeElement ?? null;
}

/** Move focus to the next (or previous) focusable in `container`, wrapping. */
export function cycleFocus(container: HTMLElement, backwards: boolean) {
  const list = focusables(container);
  if (list.length === 0) return;
  const at = list.indexOf(activeIn(container) as HTMLElement);
  const next = at < 0 ? (backwards ? list.length - 1 : 0) : (at + (backwards ? -1 : 1) + list.length) % list.length;
  list[next].focus();
}
