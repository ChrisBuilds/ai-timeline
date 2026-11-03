#!/usr/bin/env node
// Validates every event in events/ and writes public/data/events.json.
//
//   node scripts/build-data.mjs           validate, then write events.json
//   node scripts/build-data.mjs --check   validate only (used in PR checks)
//
// Exits non-zero on any error. Warnings (possible duplicates) do not fail.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import YAML from 'yaml'
import { computeScore, tierOf } from './importance.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')

const errors = []
const warnings = []

function listYaml(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...listYaml(path))
    else if (name.endsWith('.yaml') || name.endsWith('.yml')) out.push(path)
  }
  return out.sort()
}

function readYaml(path) {
  try {
    return YAML.parse(readFileSync(path, 'utf8'), { prettyErrors: true })
  } catch (e) {
    errors.push(`${relative(root, path)}: YAML parse error: ${e.message}`)
    return undefined
  }
}

// Normalise dates the YAML parser may have turned into Date objects.
function normaliseDates(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) return value.map(normaliseDates)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normaliseDates(v)]))
  }
  return value
}

const schema = JSON.parse(readFileSync(join(root, 'schema/event.schema.json'), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validate = ajv.compile(schema)

const files = listYaml(join(root, 'events'))
const events = []

for (const file of files) {
  const rel = relative(root, file)
  let data = readYaml(file)
  if (data === undefined) continue
  data = normaliseDates(data)
  // A bare year such as `date: 1956` parses as a number.
  for (const key of ['date', 'end_date']) {
    if (typeof data?.[key] === 'number') data[key] = String(data[key])
  }

  if (!validate(data)) {
    for (const e of validate.errors) {
      errors.push(`${rel}: ${e.instancePath || '(root)'} ${e.message}`)
    }
    continue
  }

  const expectedName = `${data.id}.yaml`
  if (basename(file) !== expectedName) {
    errors.push(`${rel}: file name must be ${expectedName}`)
  }
  const year = data.date.slice(0, 4)
  if (basename(dirname(file)) !== year) {
    errors.push(`${rel}: file must live in events/${year}/`)
  }
  if (!data.id.startsWith(data.date)) {
    errors.push(`${rel}: id must start with the date (${data.date})`)
  }
  if (data.end_date && data.end_date < data.date) {
    errors.push(`${rel}: end_date is before date`)
  }
  events.push({ ...data, _file: rel })
}

// Unique ids, including aliases.
const byId = new Map()
for (const ev of events) {
  for (const id of [ev.id, ...(ev.aliases ?? [])]) {
    if (byId.has(id)) errors.push(`${ev._file}: id or alias "${id}" is already used by ${byId.get(id)._file}`)
    else byId.set(id, ev)
  }
}

// Removed events must not still exist.
const removed = readYaml(join(root, 'removed.yaml')) ?? []
if (!Array.isArray(removed)) errors.push('removed.yaml: must be a list')
for (const r of Array.isArray(removed) ? removed : []) {
  if (!r?.id || !r?.reason) errors.push(`removed.yaml: every entry needs id and reason`)
  // A merged duplicate's id stays on as an alias of the kept event, which is expected.
  else if (byId.get(r.id)?.id === r.id) errors.push(`removed.yaml: ${r.id} is listed as removed but still exists`)
  else if (r.reason === 'duplicate' && byId.has(r.id) && r.duplicate_of && byId.get(r.id).id !== r.duplicate_of) {
    errors.push(`removed.yaml: ${r.id} is an alias of ${byId.get(r.id).id}, not of duplicate_of ${r.duplicate_of}`)
  }
  if (r?.reason === 'duplicate' && r.duplicate_of && !byId.has(r.duplicate_of)) {
    errors.push(`removed.yaml: ${r.id} duplicate_of ${r.duplicate_of} does not exist`)
  }
}

// Related links must point at real events, not at themselves.
for (const ev of events) {
  for (const link of ev.related ?? []) {
    if (link.id === ev.id) errors.push(`${ev._file}: related links to itself`)
    else if (!byId.has(link.id)) errors.push(`${ev._file}: related id ${link.id} does not exist`)
  }
}

// Possible duplicates: same year and similar title, or same date and shared organization.
const words = (s) => new Set(s.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2) ?? [])
const similarity = (a, b) => {
  const A = words(a), B = words(b)
  const shared = [...A].filter((w) => B.has(w)).length
  return shared / Math.max(1, Math.min(A.size, B.size))
}
for (let i = 0; i < events.length; i++) {
  for (let j = i + 1; j < events.length; j++) {
    const a = events[i], b = events[j]
    const sameDate = a.date === b.date
    const sameYear = a.date.slice(0, 4) === b.date.slice(0, 4)
    const sharedOrg = (a.organizations ?? []).some((o) => (b.organizations ?? []).includes(o))
    if ((sameYear && similarity(a.title, b.title) >= 0.6) || (sameDate && sharedOrg)) {
      warnings.push(`possible duplicate: ${a.id} and ${b.id}`)
    }
  }
}

for (const w of warnings) console.warn(`warning: ${w}`)
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`)
  console.error(`\n${errors.length} error(s) in ${files.length} event file(s).`)
  process.exit(1)
}

console.log(`${events.length} event(s) valid.`)

if (!checkOnly) {
  const out = {
    generated: new Date().toISOString(),
    events: events
      .map(({ _file, ...ev }) => {
        const score = computeScore(ev.importance)
        return { ...ev, score, tier: tierOf(score) }
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    removed: Array.isArray(removed) ? removed : [],
  }
  mkdirSync(join(root, 'public/data'), { recursive: true })
  writeFileSync(join(root, 'public/data/events.json'), JSON.stringify(out))
  console.log('Wrote public/data/events.json')
}
