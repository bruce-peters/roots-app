import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Merge an array of { start, end } clip segments.
 * Segments are sorted by start time, then any two consecutive segments
 * whose gap (next.start - prev.end) is ≤ `gap` seconds are merged into one.
 *
 * @param {Array<{start: number, end: number}>} clips
 * @param {number} gap  max seconds between clips before they're kept separate (default 3)
 * @returns {Array<{start: number, end: number}>}
 */
export function mergeClips(clips, gap = 3) {
  if (!Array.isArray(clips) || clips.length === 0) return []
  const sorted = [...clips].sort((a, b) => a.start - b.start)
  const merged = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    if (sorted[i].start - last.end <= gap) {
      // Extend the current segment rather than starting a new one.
      last.end = Math.max(last.end, sorted[i].end)
    } else {
      merged.push({ ...sorted[i] })
    }
  }
  return merged
}
