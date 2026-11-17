import { containerAround, genericContainer } from './generic';
import { siteFor } from './sites';

/**
 * The container to read (spec section 7, R15): on a chat site, the content of the reply holding
 * `block` (the last reply when no block is given); else, or when no reply matches, the generic
 * main content. A block outside the main content gets the container around it.
 */
export function findContainer(doc: Document, hostname: string, block?: Element | null): Element | null {
  const site = siteFor(hostname);
  if (site) {
    const selector = site.reply.join(', ');
    let reply: Element | null = null;
    if (block) reply = block.closest(selector);
    else {
      const replies = doc.querySelectorAll(selector);
      reply = replies[replies.length - 1] ?? null;
    }
    // A reply matched by several selectors (an outer and an inner element): use the outermost.
    while (reply?.parentElement?.closest(selector)) reply = reply.parentElement.closest(selector);
    if (reply) {
      const content = reply.querySelector(site.content);
      return content && (!block || content.contains(block)) ? content : reply;
    }
  }
  const main = genericContainer(doc);
  if (!block || !main || main.contains(block)) return main;
  return containerAround(block);
}
