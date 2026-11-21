import { alnumOffsets } from './orp';

/**
 * `[start, end)` offsets, in `word`, of its middle letter: among its letters and digits (n of them) the one
 * at index floor((n - 1) / 2), or the middle character when it has none.
 */
export function middleLetter(word: string): [number, number] {
  const offsets = alnumOffsets(word);
  const start =
    offsets.length > 0
      ? offsets[Math.floor((offsets.length - 1) / 2)]
      : Array.from(word)
          .slice(0, Math.max(0, Math.floor((Array.from(word).length - 1) / 2)))
          .join('').length;
  return [start, start + (Array.from(word.slice(start))[0]?.length ?? 0)];
}
