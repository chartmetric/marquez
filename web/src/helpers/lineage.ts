/** Parse a lineage graph depth while preserving zero as a valid direct-only depth. */
export const parseLineageDepth = (value: string | null, fallback: number): number => {
  if (value === null || value.trim() === '') {
    return fallback
  }

  const depth = Number(value)
  return Number.isInteger(depth) && depth >= 0 ? depth : fallback
}
