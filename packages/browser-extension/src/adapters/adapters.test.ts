// @vitest-environment jsdom
// All markup in this file is synthetic: minimal markup written for the test, shaped after the chat
// sites' reply structure. Behaviour on the real sites is the live row `chat-site-adapters` (D3).
import { describe, expect, it } from 'vitest';
import { findContainer } from './index';
import { genericContainer } from './generic';
import { SITES, siteFor } from './sites';

function page(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

const para = (words: number, word = 'word') => `<p>${Array.from({ length: words }, () => word).join(' ')}.</p>`;

describe('site table', () => {
  it.each(['claude.ai', 'chatgpt.com', 'chat.openai.com', 'gemini.google.com'])('has an entry for %s with reply and content selectors', (host) => {
    const site = siteFor(host);
    expect(site, host).toBeDefined();
    expect(site!.reply.length).toBeGreaterThan(0);
    expect(site!.content).toBeTruthy();
  });

  it('matches subdomains of a listed host only on a label boundary', () => {
    expect(siteFor('www.claude.ai')).toBe(siteFor('claude.ai'));
    expect(siteFor('notclaude.ai')).toBeUndefined();
    expect(siteFor('example.com')).toBeUndefined();
  });

  it('is data only', () => {
    for (const site of SITES) for (const value of Object.values(site)) expect(typeof value).not.toBe('function');
  });
});

describe('findContainer on a chat site (synthetic markup)', () => {
  const chat = () =>
    page(`
      <nav>${para(30)}</nav>
      <main>
        <div data-message-author-role="user"><p id="q1">A question?</p></div>
        <div data-message-author-role="assistant"><div class="markdown" id="c1"><p id="a1">First answer.</p></div></div>
        <div data-message-author-role="user"><p>Another?</p></div>
        <div data-message-author-role="assistant"><div class="markdown" id="c2"><p id="a2">Second answer.</p></div></div>
      </main>`);

  it('returns the content of the reply containing the block', () => {
    const doc = chat();
    expect(findContainer(doc, 'chatgpt.com', doc.getElementById('a1')!)?.id).toBe('c1');
  });

  it('returns the last reply when no block is given', () => {
    const doc = chat();
    expect(findContainer(doc, 'chat.openai.com')?.id).toBe('c2');
  });

  it('uses the reply itself when it has no content element', () => {
    const doc = page(`<div data-message-author-role="assistant" id="r"><p>No markdown wrapper.</p></div>`);
    expect(findContainer(doc, 'chatgpt.com')?.id).toBe('r');
  });

  it('falls back to the generic heuristic when no reply matches', () => {
    const doc = page(`<nav>${para(30)}</nav><main id="m">${para(40)}</main>`);
    expect(findContainer(doc, 'claude.ai')?.id).toBe('m');
  });

  it('falls back to the generic heuristic for a block outside every reply', () => {
    const doc = chat();
    expect(findContainer(doc, 'chatgpt.com', doc.getElementById('q1')!)?.tagName).toBe('MAIN');
  });

  it('finds Claude and Gemini replies', () => {
    const claude = page(`<div data-is-streaming="false"><div class="font-claude-response"><div class="standard-markdown" id="k"><p>x</p></div></div></div>`);
    expect(findContainer(claude, 'claude.ai')?.id).toBe('k');
    const gemini = page(`<model-response><message-content id="g"><div class="markdown"><p>x</p></div></message-content></model-response>`);
    expect(findContainer(gemini, 'gemini.google.com')?.className).toBe('markdown');
  });
});

describe('generic heuristic', () => {
  it.each([
    ['main', `<div>${para(80)}</div><main id="x">${para(5)}</main>`],
    ['article', `<div>${para(80)}</div><article id="x">${para(5)}</article>`],
    ['[role=main]', `<div>${para(80)}</div><div role="main" id="x">${para(5)}</div>`],
  ])('prefers %s', (_name, html) => {
    expect(genericContainer(page(html))?.id).toBe('x');
  });

  it('on a page with nav, sidebar and footer returns the article body and none of those', () => {
    const doc = page(`
      <div class="page">
        <div class="nav">${Array.from({ length: 30 }, (_, i) => `<p><a href="/${i}">Link number ${i} somewhere</a></p>`).join('')}</div>
        <div class="layout">
          <div class="sidebar">${Array.from({ length: 10 }, () => '<p><a href="#">Related reading list entry</a> and more</p>').join('')}</div>
          <div class="body" id="body">${para(60)}${para(60)}${para(60)}</div>
        </div>
        <div class="footer">${para(15)}<p><a href="#">Privacy</a> <a href="#">Terms</a></p></div>
      </div>`);
    const found = genericContainer(doc);
    expect(found?.id).toBe('body');
  });

  it('falls back to body on a page without paragraphs', () => {
    const doc = page('<span>Hi</span>');
    expect(genericContainer(doc)).toBe(doc.body);
  });

  it('with a block outside the main content, returns a container that holds the block', () => {
    const doc = page(`<main>${para(40)}</main><aside><section id="s"><p id="b">Aside text.</p></section></aside>`);
    const found = findContainer(doc, 'example.com', doc.getElementById('b')!);
    expect(found?.contains(doc.getElementById('b'))).toBe(true);
    expect(found?.id).toBe('s');
  });
});
