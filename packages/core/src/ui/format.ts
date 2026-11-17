/** A duration for people: seconds under a minute, whole minutes above. */
export function formatDuration(ms: number): string {
  if (ms < 59_500) return `${Math.max(1, Math.round(ms / 1000))} s`;
  return `${Math.round(ms / 60_000)} min`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What each exhibit kind is called in the UI. */
export const EXHIBIT_LABELS = { code: 'Code', table: 'Table', math: 'Formula', image: 'Image', diagram: 'Diagram' } as const;
