#!/usr/bin/env node
// CI compares with the PR base. Assessment history is append-only; acceptance of
// a provisional judgment requires a new record rather than rewriting the past.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import YAML from 'yaml'

export function historyErrors(before, after) {
  const errors = []
  if (!after) return errors // Event removals use the existing removal workflow.
  for (const key of ['rubric', 'override', 'override_reason', 'override_review_after']) {
    if (!isDeepStrictEqual(before[key], after[key])) errors.push(`original ${key} is immutable; append an assessment instead`)
  }
  if (before.legacy && !isDeepStrictEqual(before.legacy, after.legacy)) errors.push('legacy migration record is immutable')
  for (const a of before.assessments ?? []) {
    if (!isDeepStrictEqual(a, after.assessments?.find((b) => b.id === a.id))) errors.push(`assessment ${a.id} was changed or removed`)
  }
  return errors
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const ref = process.argv[2]
  if (!ref || ref.startsWith('-')) throw new Error('Usage: node scripts/assessment-history.mjs BASE_REF')
  // Explicit argument array; no shell interpolation of refs or file names.
  const files = execFileSync('git', ['diff', '--name-only', '--diff-filter=M', ref, '--', 'events/'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const errors = []
  for (const file of files) {
    if (!file.endsWith('.yaml') || !existsSync(file)) continue
    const before = YAML.parse(execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' }))
    const after = YAML.parse(readFileSync(file, 'utf8'))
    errors.push(...historyErrors(before.importance, after.importance).map((e) => `${file}: ${e}`))
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
  else console.log(`Assessment history preserved in ${files.length} changed event(s).`)
}
