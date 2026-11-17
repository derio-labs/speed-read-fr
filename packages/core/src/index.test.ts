import { describe, expect, it } from 'vitest';
import * as core from './index';

describe('public API', () => {
  it('exports the engine entry points', () => {
    for (const name of [
      'DEFAULT_SETTINGS',
      'normalizeSettings',
      'memoryStore',
      'tokenize',
      'splitSentences',
      'chunkSentence',
      'orp',
      'buildTimeline',
      'stepDuration',
      'rampFactor',
      'sectionEstimate',
      'createPlayer',
    ]) {
      expect(core, name).toHaveProperty(name);
    }
  });
});
