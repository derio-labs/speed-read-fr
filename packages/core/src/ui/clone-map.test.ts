// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createCloneMap, sourceRefOf } from './clone-map';

describe('createCloneMap', () => {
  it('maps paired elements both ways and never resolves a root through refAt', () => {
    document.body.innerHTML = '<div id="root"><p id="p" data-line="4">a <em>b</em></p></div>';
    const root = document.getElementById('root')!;
    const p = document.getElementById('p')!;
    const copy = root.cloneNode(true) as Element;
    const map = createCloneMap([root]);
    map.pairTree(root, copy);
    const pCopy = map.locate({ element: p })!;
    expect(pCopy).toBe(copy.querySelector('p'));
    expect(map.refAt(pCopy.querySelector('em')!)).toEqual({ element: p.querySelector('em') });
    expect(map.refAt(pCopy)).toEqual({ element: p, line: 4 });
    expect(map.refAt(copy)).toBeNull();
    expect(map.locate({ element: null })).toBeNull();
  });

  it('pairs single elements', () => {
    const a = document.createElement('p');
    const b = document.createElement('p');
    const map = createCloneMap([]);
    map.pair(a, b);
    expect(map.locate({ element: a })).toBe(b);
    expect(sourceRefOf(a)).toEqual({ element: a });
  });
});
