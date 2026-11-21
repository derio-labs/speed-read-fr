/** Characters that fit a chunk stage: its width over one character's width, in the settings' [5, 80]; null unmeasured. */
export const FIT_MIN = 5;
export const FIT_MAX = 80;
/** The probe text's length; its width / PROBE_CHARS is the width of one character at the chunk font. */
export const PROBE_CHARS = 10;

export function chunkFit(stageWidth: number, probeWidth: number): number | null {
  if (!(stageWidth > 0) || !(probeWidth > 0)) return null;
  const charWidth = probeWidth / PROBE_CHARS;
  return Math.min(FIT_MAX, Math.max(FIT_MIN, Math.floor(stageWidth / charWidth)));
}
