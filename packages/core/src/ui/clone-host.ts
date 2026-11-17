import type { SourceRef } from '../model';
import type { Host, HostDocument } from './host';

export interface CloneHostOptions {
  /** Class of the element every returned node is wrapped in, so host styles can target clones. */
  wrapperClass?: string;
  onPosition?(ref: SourceRef): void;
  onClose?(): void;
}

function refOf(el: Element): SourceRef {
  const line = Number.parseInt(el.getAttribute('data-line') ?? '', 10);
  return Number.isInteger(line) ? { element: el, line } : { element: el };
}

/** Pair every element of `original` with its counterpart in `copy`, a deep clone of it. */
function pairElements(original: Element, copy: Element, toCopy: Map<Element, Element>, toOriginal: WeakMap<Element, Element>) {
  toCopy.set(original, copy);
  toOriginal.set(copy, original);
  const a = original.children;
  const b = copy.children;
  for (let i = 0; i < a.length && i < b.length; i++) pairElements(a[i], b[i], toCopy, toOriginal);
}

/**
 * A `Host` for a host whose rendered DOM can be shown by cloning it (the demo page, the VS Code
 * webview). Exhibits and the normal-reading view are deep clones of the source elements.
 */
export function createCloneHost(source: Element | Element[], opts: CloneHostOptions = {}): Host {
  const roots = Array.isArray(source) ? source : [source];
  const ownerDocument = roots[0]?.ownerDocument ?? document;
  const wrap = (...nodes: Node[]) => {
    const wrapper = ownerDocument.createElement('div');
    if (opts.wrapperClass) wrapper.className = opts.wrapperClass;
    wrapper.append(...nodes);
    return wrapper;
  };
  return {
    exhibit(block) {
      const el = block.source.element;
      return wrap(...(el ? [el.cloneNode(true)] : []));
    },
    document(): HostDocument {
      const toCopy = new Map<Element, Element>();
      const toOriginal = new WeakMap<Element, Element>();
      const copies = roots.map((root) => {
        const copy = root.cloneNode(true) as Element;
        copy.removeAttribute('id');
        pairElements(root, copy, toCopy, toOriginal);
        return copy;
      });
      return {
        node: wrap(...copies),
        locate: (ref) => (ref.element ? (toCopy.get(ref.element) ?? null) : null),
        refAt(target) {
          for (let el: Element | null = target; el; el = el.parentElement) {
            const original = toOriginal.get(el);
            if (original && !roots.includes(original)) return refOf(original);
          }
          return null;
        },
      };
    },
    release() {},
    onPosition: (ref) => opts.onPosition?.(ref),
    onClose: () => opts.onClose?.(),
  };
}
