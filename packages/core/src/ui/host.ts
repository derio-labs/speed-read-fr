import type { ExhibitBlock, SourceRef } from '../model';

/** Where an exhibit node is shown: the exhibit pane, or expanded over the stage. */
export type ExhibitUse = 'pane' | 'expanded';

/** The normal-reading content and the mapping between its elements and source refs. */
export interface HostDocument {
  node: Node;
  locate(ref: SourceRef): Element | null;
  refAt(target: Element): SourceRef | null;
}

/**
 * The bridge the core calls (spec section 6). The core never clones or moves source elements
 * itself: every node it shows comes from the host and is handed back through `release`.
 */
export interface Host {
  /** A new, independent node displaying `block`, for the core to insert into its own tree. */
  exhibit(block: ExhibitBlock, use: ExhibitUse): Node;
  /** The normal-reading content. */
  document(): HostDocument;
  /** A node returned by `exhibit` or `document` is no longer shown. */
  release(node: Node): void;
  onPosition(ref: SourceRef): void;
  onClose(): void;
}
