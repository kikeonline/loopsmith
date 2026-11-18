export const PROJECT_MARKER = '// @loopsmith-project/v1';
export const TRACK_MARKER = '// @loopsmith-track/v1 ';

/** Object key order is not part of model equality. */
export function stableJSON(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);
}
