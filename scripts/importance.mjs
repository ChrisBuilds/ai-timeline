// Importance score (0 to 100) and tier for an event.
//
// Interim formula: until measured signals (citations, page views, timeline
// influence) are collected, the score comes from the editorial rubric alone.
// It blends the rubric average with its single highest rating, so an event
// that is extreme on one axis (Deep Blue's cultural reach, say) can still be a
// landmark. A maintainer override always wins.

export const TIERS = [
  { tier: 1, name: 'Landmark', min: 85 },
  { tier: 2, name: 'Major', min: 65 },
  { tier: 3, name: 'Notable', min: 40 },
  { tier: 4, name: 'Detail', min: 0 },
]

/** @param {{rubric: Record<string, number>, override?: number}} importance */
export function computeScore(importance) {
  if (typeof importance.override === 'number') return importance.override
  const ratings = Object.values(importance.rubric)
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length
  const max = Math.max(...ratings)
  const blended = 0.5 * mean + 0.5 * max // 1 to 5
  return Math.round(((blended - 1) / 4) * 100)
}

/** @param {number} score */
export function tierOf(score) {
  return (TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1]).tier
}
