/** Characters that fit a chunk stage: its width over one character's width, in the settings' [5, 80]; null unmeasured. */
export const FIT_MIN = 5;
export const FIT_MAX = 80;
/** Lowercase prose, measured at the chunk font: its width / length is the width of one character of real text. */
export const PROBE_TEXT = 'the quick brown fox jumps over a lazy dog';

export function chunkFit(stageWidth: number, probeWidth: number, probeChars = PROBE_TEXT.length): number | null {
  if (!(stageWidth > 0) || !(probeWidth > 0)) return null;
  const charWidth = probeWidth / probeChars;
  return Math.min(FIT_MAX, Math.max(FIT_MIN, Math.floor(stageWidth / charWidth)));
}
