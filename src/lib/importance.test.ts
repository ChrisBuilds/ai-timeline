import { describe, expect, it } from 'vitest'
import { assessmentErrors, computeScore, importanceSummary, legacyScore, scoreRange, tierOf } from '../../scripts/importance.mjs'
import type { Importance, ImportanceAssessment } from './types'

const rubric = { capability: 3, adoption: 5, impact: 5, culture: 5 }
function assessment(ratings: (number | null)[] = [5, 5, 3, 5]): ImportanceAssessment {
  return {
    id: '2026-11-04-v2', assessed_at: '2026-11-04', rubric_version: 'v2', status: 'accepted', reviewer: 'Editorial review',
    rationale: 'Assess significance using retrospective evidence.',
    dimensions: Object.fromEntries(['influence', 'adoption', 'capability', 'society'].map((name, i) => [name, {
      rating: ratings[i], confidence: 'medium', rationale: 'Dimension supported by independently reviewed evidence.', evidence: ['https://example.com/evidence'],
    }])) as ImportanceAssessment['dimensions'],
    comparisons: [], questions: [], review_after: '2027-02-04', review_triggers: ['New independent evidence of adoption.'],
  }
}
function importance(a = assessment()): Importance {
  return { rubric, legacy: { rubric_version: 'v1', migrated_at: '2026-11-04' }, current: a.id, assessments: [a] }
}

describe('versioned significance', () => {
  it('preserves v1 scores and overrides exactly', () => {
    expect(legacyScore({ rubric })).toBe(94)
    expect(computeScore({ rubric })).toBe(94)
    expect(computeScore({ rubric, override: 100 })).toBe(100)
    expect(computeScore({ rubric: { capability: 1, adoption: 1, impact: 1, culture: 1 } })).toBe(0)
  })
  it('uses weighted dimensions without a maximum-rating bonus', () => {
    expect(computeScore(importance())).toBe(90) // ChatGPT: 35 + 30 + 15 + 10
    expect(computeScore(importance(assessment([4, 4, 4, 3])))).toBe(78) // Claude Code
    expect(computeScore(importance(assessment([4, 3, 4, 4])))).toBe(74)
    expect(computeScore(importance(assessment([0, 0, 0, 0])))).toBe(0)
    expect(computeScore(importance(assessment([5, 5, 5, 5])))).toBe(100)
  })
  it('does not penalize confidence or age, and does not read the newest proposal as accepted', () => {
    const original = assessment()
    const later = { ...assessment([3, 3, 3, 3]), id: 'later', assessed_at: '2026-11-04', status: 'provisional' as const, questions: ['Verify sustained influence.'] }
    const imp = importance(original)
    imp.assessments!.push(later)
    expect(importanceSummary(imp).score).toBe(90)
    original.dimensions.influence.confidence = 'low'
    original.assessed_at = '2020-01-01'
    expect(computeScore(imp)).toBe(90)
    imp.current = later.id
    expect(importanceSummary(imp)).toMatchObject({ score: 90, score_basis: original.id, score_status: 'provisional' })
  })
  it('keeps unknowns explicit and retains an established score without normalizing', () => {
    const a = assessment([null, 4, 4, 3])
    a.status = 'provisional'
    a.questions = ['What is the sustained influence?']
    expect(scoreRange(a)).toEqual([50, 85])
    expect(computeScore(importance(a))).toBeNull()
    expect(importanceSummary(importance(a))).toMatchObject({ score: 94, score_status: 'provisional', score_basis: 'v1', score_range: [50, 85] })
    a.status = 'accepted'
    expect(assessmentErrors(importance(a))).toContain(`${a.id}: accepted assessment has unknown ratings`)
  })
  it('separates overview designation from score and keeps old overrides out of v2', () => {
    const a = assessment([4, 4, 4, 3])
    a.overview_reason = 'First launch of the continuing terminal coding workflow.'
    const imp = { ...importance(a), override: 100, override_reason: 'Original origin-event override.' }
    expect(importanceSummary(imp)).toMatchObject({ score: 78, overview: true })
    a.override = 88
    a.override_reason = 'Maintainer-reviewed exceptional historical significance.'
    a.override_review_after = '2027-02-04'
    expect(importanceSummary(imp).score).toBe(88)
  })
  it('rejects missing current references, duplicate IDs, and invalid review dates', () => {
    const imp = importance()
    imp.current = 'missing'
    expect(() => computeScore(imp)).toThrow('Unknown current assessment')
    expect(assessmentErrors(imp)).toContain('current must reference an assessment id')
    imp.assessments!.push(imp.assessments![0])
    expect(assessmentErrors(imp)).toContain('duplicate assessment id 2026-11-04-v2')
    imp.assessments![0].review_after = '2026-01-01'
    expect(assessmentErrors(imp).some((e) => e.includes('review_after must follow'))).toBe(true)
  })
})

describe('tiers', () => {
  it.each([[100, 1], [85, 1], [84, 2], [65, 2], [64, 3], [40, 3], [39, 4], [0, 4]])('maps %i to tier %i', (score, tier) => {
    expect(tierOf(score)).toBe(tier)
  })
})

it('supports new v2-only events without inventing a legacy assessment', () => {
  const a = assessment()
  const imp: Importance = { current: a.id, assessments: [a] }
  expect(legacyScore(imp)).toBeNull()
  expect(importanceSummary(imp)).toMatchObject({ score: 90, score_basis: a.id, score_status: 'accepted' })
  a.status = 'provisional'
  a.dimensions.influence.rating = null
  a.questions = ['Verify downstream influence.']
  expect(computeScore(imp)).toBeNull()
  expect(importanceSummary(imp)).toMatchObject({ score: 55, score_basis: 'v2-lower-bound', score_status: 'provisional', score_range: [55, 90] })
})
