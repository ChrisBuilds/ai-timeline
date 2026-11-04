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

it('retains immutable comparisons when the referenced event is removed through a tombstone', async () => {
  // Exercise the real builder in an isolated fixture repository, not a replica
  // of its reference check. No source files or checked-out event data are edited.
  const { mkdtempSync, mkdirSync, writeFileSync, cpSync, symlinkSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const { spawn } = await import('node:child_process')
  const root = fileURLToPath(new URL('../', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'importance-tombstone-'))
  try {
    cpSync(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true })
    cpSync(join(root, 'schema'), join(dir, 'schema'), { recursive: true })
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir')
    const e = sample()
    const ids = e.importance.assessments[0].comparisons.map((c) => c.id)
    mkdirSync(join(dir, 'events/2022'), { recursive: true })
    writeFileSync(join(dir, `events/2022/${e.id}.yaml`), YAML.stringify(e))
    writeFileSync(join(dir, 'removed.yaml'), YAML.stringify(ids.map((id) => ({ id, reason: 'out-of-scope' }))))
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/build-data.mjs', '--check'], { cwd: dir })
      let output = ''
      child.stdout.on('data', (data) => { output += String(data) })
      child.stderr.on('data', (data) => { output += String(data) })
      child.once('error', reject)
      child.once('exit', (code) => resolve({ code, output }))
    })
    expect(result.output).toContain('1 event(s) valid.')
    expect(result.code).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
