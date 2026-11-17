import type { SourceRef } from '../model';
import { createCloneMap } from './clone-map';
import type { Host, HostDocument } from './host';

export interface CloneHostOptions {
  /** Class of the element every returned node is wrapped in, so host styles can target clones. */
  wrapperClass?: string;
  onPosition?(ref: SourceRef): void;
  onClose?(): void;
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
      const map = createCloneMap(roots);
      const copies = roots.map((root) => {
        const copy = root.cloneNode(true) as Element;
        copy.removeAttribute('id');
        map.pairTree(root, copy);
        return copy;
      });
      return { node: wrap(...copies), locate: map.locate, refAt: map.refAt };
    },
    release() {},
    onPosition: (ref) => opts.onPosition?.(ref),
    onClose: () => opts.onClose?.(),
  };
}
