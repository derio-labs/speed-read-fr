// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Block, ListItem } from './model';
import { createPlayer } from './player';
import { DEFAULT_SETTINGS } from './settings';
import { fakeClock } from './testing/clock';
import { doc, prose, section } from './testing/doc';
import { splitSentences, tokenize } from './text/sentences';
import { buildTimeline } from './timeline';

describe('jumpToBlock with DOM elements', () => {
  it('finds the steps of an element the ref element contains', () => {
    document.body.innerHTML = '<ul><li>one two three four five six seven</li><li>eight</li></ul>';
    const ul = document.querySelector('ul')!;
    const lis = [...document.querySelectorAll('li')];
    const items: ListItem[] = lis.map((li, i) => ({
      depth: 0,
      index: i + 1,
      of: 2,
      sentences: splitSentences(tokenize(li.textContent ?? '')),
      source: { element: li },
    }));
    const list: Block = { kind: 'list', ordered: false, items, source: { element: ul } };
    const d = doc(section('s', undefined, prose('Intro.'), list));
    const settings = { ...DEFAULT_SETTINGS, chunkWords: 1 };
    const t = buildTimeline(d, settings);
    const player = createPlayer(t, settings, fakeClock());
    player.jumpToBlock({ element: ul });
    expect(t.steps[player.index].source.element).toBe(lis[0]);
    expect(player.index).toBe(1);
    player.jumpToBlock({ element: lis[1] });
    expect(t.steps[player.index].source.element).toBe(lis[1]);
  });
});
