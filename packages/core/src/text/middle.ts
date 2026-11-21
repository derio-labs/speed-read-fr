import { alnumOffsets } from './orp';

/**
 * Character offset, in `word`, of its middle letter: among its letters and digits (n of them) the one
 * at index floor((n - 1) / 2), or the middle character when it has none.
 */
export function middleLetter(word: string): number {
  const offsets = alnumOffsets(word);
  if (offsets.length > 0) return offsets[Math.floor((offsets.length - 1) / 2)];
  const chars = Array.from(word);
  return chars.slice(0, Math.max(0, Math.floor((chars.length - 1) / 2))).join('').length;
}
