export interface OrpSplit {
  before: string;
  pivot: string;
  after: string;
}

export const ALNUM = /[\p{L}\p{N}]/u;

/** Character offsets, in `word`, of its letters and digits. */
export function alnumOffsets(word: string): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const ch of word) {
    if (ALNUM.test(ch)) offsets.push(offset);
    offset += ch.length;
  }
  return offsets;
}

/** Index, among a word's letters and digits, of its optimal-recognition-point letter. */
export function pivotIndex(length: number): number {
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  if (length <= 13) return 3;
  return 4;
}

/** Character offset of the pivot inside `word`; the first character when the word has no letters or digits. */
function pivotOffset(word: string): number {
  const offsets = alnumOffsets(word);
  if (offsets.length === 0) return 0;
  return offsets[pivotIndex(offsets.length)];
}

/** Split a chunk's text around the pivot of its anchor word (the word holding the character midpoint). */
export function orp(text: string): OrpSplit {
  if (text.length === 0) return { before: '', pivot: '', after: '' };
  const midpoint = Math.floor(text.length / 2);
  let anchorStart = 0;
  let anchor = '';
  for (const match of text.matchAll(/\S+/gu)) {
    const start = match.index ?? 0;
    anchorStart = start;
    anchor = match[0];
    if (start + anchor.length > midpoint) break;
  }
  const at = anchorStart + pivotOffset(anchor);
  const pivotLength = Array.from(text.slice(at))[0]?.length ?? 0;
  return { before: text.slice(0, at), pivot: text.slice(at, at + pivotLength), after: text.slice(at + pivotLength) };
}
