#!/usr/bin/env node
// No network or writes. Review dates flag work; time never changes a score.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import { currentAssessment, importanceSummary, legacyScore, scoreRange } from './importance.mjs'
const root = fileURLToPath(new URL('../events/', import.meta.url))
const dateArg = process.argv.indexOf('--as-of')
const asOf = dateArg === -1 ? new Date().toISOString().slice(0, 10) : process.argv[dateArg + 1]
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '') || !Number.isFinite(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0, 10) !== asOf) throw new Error('--as-of requires a valid YYYY-MM-DD date')
const events = readdirSync(root, { recursive: true }).filter((p) => String(p).endsWith('.yaml')).map((p) => YAML.parse(readFileSync(root + p, 'utf8'))).sort((a, b) => a.id.localeCompare(b.id))
const rows = events.map((e) => {
  const a = currentAssessment(e.importance)
  const summary = importanceSummary(e.importance)
  const reasons = []
  if (!a) reasons.push('legacy assessment needs migration')
  if (a?.status === 'provisional') reasons.push('provisional evidence')
  if (a && a.review_after <= asOf) reasons.push('assessment review due')
  if (a?.override_review_after && a.override_review_after <= asOf) reasons.push('override review due')
  if (!e.importance.legacy && e.importance.override_review_after && e.importance.override_review_after <= asOf) reasons.push('legacy override review due')
  return { id: e.id, title: e.title, previous: legacyScore(e.importance), ...summary, candidate: a ? scoreRange(a) : null, review_after: a?.review_after ?? null, reasons, questions: a?.questions ?? [], triggers: a?.review_triggers ?? [] }
})
if (process.argv.includes('--review')) {
  console.log(JSON.stringify({ as_of: asOf, events: rows.filter((r) => r.reasons.length) }, null, 2))
} else {
  console.log('| Event | v1 | Published | v2 rubric / bounds | Status | Overview |')
  console.log('| --- | ---: | ---: | ---: | --- | --- |')
  for (const r of rows) console.log(`| ${r.title} | ${r.previous ?? '—'} | ${r.score} | ${r.candidate ? [...new Set(r.candidate)].join('–') : '—'} | ${r.score_status} | ${r.overview ? 'Yes' : ''} |`)
}
