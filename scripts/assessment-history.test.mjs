import { describe, it, expect } from 'vitest'
import { historyErrors } from './assessment-history.mjs'
import { readFileSync } from 'node:fs'
import YAML from 'yaml'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
const schema = JSON.parse(readFileSync(new URL('../schema/event.schema.json', import.meta.url)))
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validate = ajv.compile(schema)
const sample = () => YAML.parse(readFileSync(new URL('../events/2022/2022-11-30-chatgpt-launch.yaml', import.meta.url), 'utf8'))

describe('assessment records', () => {
  it('validates a migrated event and rejects unsupported versions, ratings and override omissions', () => {
    const e = sample()
    expect(validate(e)).toBe(true)
    const a = e.importance.assessments[0]
    a.rubric_version = 'v99'
    expect(validate(e)).toBe(false)
    a.rubric_version = 'v2'
    a.dimensions.adoption.rating = 6
    expect(validate(e)).toBe(false)
    a.dimensions.adoption.rating = 5
    a.override = 95
    expect(validate(e)).toBe(false)
    a.override_reason = 'A sufficiently detailed maintainer explanation.'
    a.override_review_after = '2027-02-04'
    expect(validate(e)).toBe(true)
  })
  it('allows v2-only new events without an invented original rubric', () => {
    const e = sample()
    delete e.importance.rubric
    delete e.importance.legacy
    expect(validate(e)).toBe(true)
  })
  it('allows appending reassessments and selecting an earlier accepted record', () => {
    const before = sample().importance
    const after = structuredClone(before)
    after.assessments.push({ ...structuredClone(after.assessments[0]), id: 'new-assessment', assessed_at: '2027-01-01' })
    expect(historyErrors(before, after)).toEqual([])
  })
  it('rejects edits and deletions of earlier judgments, original ratings and migration dates', () => {
    const before = sample().importance
    for (const mutate of [
      (a) => { a.assessments[0].dimensions.adoption.rating = 2 },
      (a) => { a.assessments = [] },
      (a) => { a.rubric.adoption = 2 },
      (a) => { a.legacy.migrated_at = '2026-01-01' },
    ]) {
      const after = structuredClone(before)
      mutate(after)
      expect(historyErrors(before, after).length).toBeGreaterThan(0)
    }
  })
})
