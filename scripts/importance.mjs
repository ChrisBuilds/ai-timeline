// v1 is kept reproducible for historical assessments. Never change weights for
// an existing rubric version: introduce v3 instead. Confidence is not a weight.
export const WEIGHTS = { influence: 0.35, adoption: 0.30, capability: 0.25, society: 0.10 }
export const TIERS = [
  { tier: 1, name: 'Landmark', min: 85 },
  { tier: 2, name: 'Major', min: 65 },
  { tier: 3, name: 'Notable', min: 40 },
  { tier: 4, name: 'Detail', min: 0 },
]

/** @param {import('../src/lib/types').Importance} importance */
export function currentAssessment(importance) {
  if (!importance.assessments) return undefined
  const assessment = importance.assessments.find((a) => a.id === importance.current)
  if (!assessment) throw new Error(`Unknown current assessment: ${importance.current}`)
  return assessment
}

/** @param {import('../src/lib/types').Importance} importance */
export function legacyScore(importance) {
  if (typeof importance.override === 'number') return importance.override
  const ratings = Object.values(importance.rubric)
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length
  return Math.round(((0.5 * mean + 0.5 * Math.max(...ratings) - 1) / 4) * 100)
}

/** Unknown dimensions yield bounds, never an invented zero or reweighted average.
 * @param {import('../src/lib/types').ImportanceAssessment} assessment
 * @returns {[number, number]}
 */
export function scoreRange(assessment) {
  let lower = 0
  let upper = 0
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const rating = assessment.dimensions[/** @type {keyof typeof WEIGHTS} */ (key)].rating
    lower += weight * (rating ?? 0)
    upper += weight * (rating ?? 5)
  }
  return [Math.round(20 * lower), Math.round(20 * upper)]
}

/** A partial assessment has no point score. @param {import('../src/lib/types').Importance} importance */
export function computeScore(importance) {
  const assessment = currentAssessment(importance)
  if (!assessment) return legacyScore(importance)
  const complete = Object.values(assessment.dimensions).every((d) => d.rating !== null)
  if (!complete) return null
  return assessment.override ?? scoreRange(assessment)[0]
}

/** Slim provenance for the index; full evidence and history stay in details.
 * A provisional assessment never silently replaces an accepted score.
 * @param {import('../src/lib/types').Importance} importance
 */
export function importanceSummary(importance) {
  const current = currentAssessment(importance)
  const accepted = current?.status === 'accepted' ? current : importance.assessments?.filter((a) => a.status === 'accepted' && a.assessed_at <= (current?.assessed_at ?? '9999')).sort((a, b) => b.assessed_at.localeCompare(a.assessed_at) || b.id.localeCompare(a.id))[0]
  const score = accepted ? computeScore({ ...importance, current: accepted.id }) : legacyScore(importance)
  if (score === null) throw new Error('Accepted assessments must be complete')
  return {
    score,
    tier: tierOf(score),
    overview: Boolean(current?.overview_reason),
    score_status: current?.status ?? 'legacy',
    score_basis: accepted?.id ?? 'v1',
    ...(current?.status === 'provisional' ? { score_range: scoreRange(current) } : {}),
  }
}

/** Semantic validation beyond JSON Schema. @param {import('../src/lib/types').Importance} importance */
export function assessmentErrors(importance) {
  const errors = []
  const ids = new Set()
  const today = new Date().toISOString().slice(0, 10)
  for (const a of importance.assessments ?? []) {
    if (ids.has(a.id)) errors.push(`duplicate assessment id ${a.id}`)
    ids.add(a.id)
    if (a.assessed_at > today) errors.push(`${a.id}: assessment cannot be dated in the future`)
    if (new Set(a.comparisons.map((c) => c.id)).size !== a.comparisons.length) errors.push(`${a.id}: comparison ids must be distinct`)
    if (a.review_after <= a.assessed_at) errors.push(`${a.id}: review_after must follow assessed_at`)
    if (a.override_review_after && a.override_review_after <= a.assessed_at) errors.push(`${a.id}: override review must follow assessed_at`)
    if (a.status === 'accepted' && Object.values(a.dimensions).some((d) => d.rating === null)) errors.push(`${a.id}: accepted assessment has unknown ratings`)
    if (a.status === 'provisional' && a.questions.length === 0) errors.push(`${a.id}: provisional assessment needs an open question`)
  }
  if (importance.assessments && !ids.has(importance.current)) errors.push('current must reference an assessment id')
  return errors
}

/** @param {number} score */
export function tierOf(score) {
  return (TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1]).tier
}
