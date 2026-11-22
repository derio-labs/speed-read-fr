import type { Page } from '@playwright/test';

/**
 * Runs in the page: the box of the middle letter of the ribbon word `word` (the one on the target), by the
 * core's rule (`middleLetter`): among its letters and digits the one at index floor((n - 1) / 2), or the
 * middle character when there are none. The flow ribbon colours no letter, so a test finds it by geometry.
 * Kept free of closures and type syntax so `toString()` can ship it into the page.
 */
function middleLetterBox(word: Element): DOMRect {
  const text = word.textContent ?? '';
  const letters: number[] = [];
  let offset = 0;
  for (const ch of text) {
    if (/[\p{L}\p{N}]/u.test(ch)) letters.push(offset);
    offset += ch.length;
  }
  const chars = Array.from(text);
  const start = letters.length > 0 ? letters[Math.floor((letters.length - 1) / 2)] : chars.slice(0, Math.max(0, Math.floor((chars.length - 1) / 2))).join('').length;
  const end = start + (Array.from(text.slice(start))[0] ?? '').length;
  const walker = word.ownerDocument.createTreeWalker(word, 4);
  let seen = 0;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (start >= seen + node.data.length) {
      seen += node.data.length;
      continue;
    }
    const range = word.ownerDocument.createRange();
    range.setStart(node, start - seen);
    range.setEnd(node, Math.min(node.data.length, end - seen));
    return range.getBoundingClientRect();
  }
  return word.getBoundingClientRect();
}

/** The same function as a string, to prefix a string-evaluated page script (which a page's CSP never blocks). */
export const MIDDLE_LETTER_BOX_SRC = middleLetterBox.toString();

/** Make `window.__middleBox(word)` available in the page, for `page.evaluate`d functions. */
export async function installMiddleBox(page: Page): Promise<void> {
  await page.evaluate(`window.__middleBox = ${MIDDLE_LETTER_BOX_SRC}`);
}

declare global {
  interface Window {
    __middleBox: (word: Element) => DOMRect;
  }
}
