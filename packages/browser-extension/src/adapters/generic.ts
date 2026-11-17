/** The generic main-content heuristic (spec section 7): landmarks first, else the best-scored element. */

const LANDMARKS = ['main', 'article', '[role=main]'];
/** Page furniture: never the main content, and not counted inside a candidate. */
const FURNITURE = 'nav, aside, footer, header, [role=navigation], [role=complementary], [role=contentinfo]';

function linkDensity(el: Element): number {
  const total = (el.textContent ?? '').trim().length;
  if (total === 0) return 1;
  let links = 0;
  for (const a of el.querySelectorAll('a')) links += (a.textContent ?? '').trim().length;
  return Math.min(1, links / total);
}

/** Text length of the element's direct paragraph children, penalised by its link density. */
function score(el: Element): number {
  let text = 0;
  for (const child of el.children) if (child.tagName === 'P') text += (child.textContent ?? '').trim().length;
  return text === 0 ? 0 : text * (1 - linkDensity(el));
}

/** The page's main content: `main`, `article`, `[role=main]`, else the highest-scoring element, else body. */
export function genericContainer(doc: Document): Element | null {
  for (const selector of LANDMARKS) {
    const found = doc.querySelector(selector);
    if (found) return found;
  }
  let best: Element | null = null;
  let bestScore = 0;
  for (const el of doc.body?.querySelectorAll('*') ?? []) {
    if (el.closest(FURNITURE)) continue;
    const s = score(el);
    if (s > bestScore) {
      best = el;
      bestScore = s;
    }
  }
  return best ?? doc.body;
}

/** A container for a block the main content does not hold: its nearest sectioning ancestor, else its parent. */
export function containerAround(block: Element): Element {
  return block.parentElement?.closest('article, main, section, [role=main]') ?? block.parentElement ?? block;
}
