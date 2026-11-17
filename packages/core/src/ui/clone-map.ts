import type { SourceRef } from '../model';

/** The source ref of an element: the element, with its `data-line` when it has one. */
export function sourceRefOf(el: Element): SourceRef {
  const line = Number.parseInt(el.getAttribute('data-line') ?? '', 10);
  return Number.isInteger(line) ? { element: el, line } : { element: el };
}

/**
 * The mapping between source elements and their copies that a host showing clones needs for
 * `HostDocument.locate` and `refAt`. `refAt` walks up from a copy to the nearest paired element
 * and never answers with one of `roots` (the containers the copies were made from).
 */
export interface CloneMap {
  pair(original: Element, copy: Element): void;
  /** Pair `copy`, a deep clone of `original`, element by element. */
  pairTree(original: Element, copy: Element): void;
  locate(ref: SourceRef): Element | null;
  refAt(target: Element): SourceRef | null;
}

export function createCloneMap(roots: readonly Element[]): CloneMap {
  const toCopy = new Map<Element, Element>();
  const toOriginal = new WeakMap<Element, Element>();
  const map: CloneMap = {
    pair(original, copy) {
      toCopy.set(original, copy);
      toOriginal.set(copy, original);
    },
    pairTree(original, copy) {
      map.pair(original, copy);
      const a = original.children;
      const b = copy.children;
      for (let i = 0; i < a.length && i < b.length; i++) map.pairTree(a[i], b[i]);
    },
    locate: (ref) => (ref.element ? (toCopy.get(ref.element) ?? null) : null),
    refAt(target) {
      for (let el: Element | null = target; el; el = el.parentElement) {
        const original = toOriginal.get(el);
        if (original && !roots.includes(original)) return sourceRefOf(original);
      }
      return null;
    },
  };
  return map;
}
