/**
 * Site adapters (spec section 7, R15): data only. `hosts` are hostnames matched exactly or as a
 * parent domain; `reply` selectors find one assistant reply; `content` finds the reply's rendered
 * body inside it (the reply itself when absent). The selectors follow each site's markup as known
 * when written; when none matches, reading falls back to the generic heuristic, so a markup change
 * degrades to generic behaviour instead of failing.
 */
export interface SiteAdapter {
  hosts: readonly string[];
  reply: readonly string[];
  content: string;
}

export const SITES: readonly SiteAdapter[] = [
  {
    hosts: ['claude.ai'],
    reply: ['[data-is-streaming]', '.font-claude-response', '.font-claude-message'],
    content: '.standard-markdown, .progressive-markdown',
  },
  {
    hosts: ['chatgpt.com', 'chat.openai.com'],
    reply: ['[data-message-author-role="assistant"]'],
    content: '.markdown',
  },
  {
    hosts: ['gemini.google.com'],
    reply: ['model-response', 'message-content'],
    content: '.markdown, .model-response-text',
  },
];

/** The adapter for `hostname`, matching it or any subdomain of a listed host. */
export function siteFor(hostname: string): SiteAdapter | undefined {
  const host = hostname.toLowerCase();
  return SITES.find((site) => site.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
}
