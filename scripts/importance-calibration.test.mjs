import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import YAML from 'yaml'
import { computeScore, importanceSummary, WEIGHTS } from './importance.mjs'
const root = new URL('../events/', import.meta.url)
const events = readdirSync(root, { recursive: true }).filter((p) => String(p).endsWith('.yaml')).map((p) => YAML.parse(readFileSync(new URL(p, root), 'utf8')))
const event = (slug) => {
  const match = events.find((e) => e.id.endsWith(slug))
  if (!match) throw Error(`Missing calibration event ${slug}`)
  return match
}
const score = (slug) => computeScore(event(slug).importance)

describe('editorial calibration examples', () => {
  it('balances research, consumer access, developer workflows and governance', () => {
    expect(score('attention-is-all-you-need')).toBeGreaterThanOrEqual(score('chatgpt-launch'))
    expect(score('chatgpt-launch')).toBeGreaterThan(score('openai-gpt-4'))
    expect(score('alexnet-imagenet')).toBeGreaterThan(score('watson-jeopardy'))
    expect(score('eu-ai-act-enters-force')).toBeGreaterThan(score('openai-gpt2-staged-release'))
    expect(importanceSummary(event('claude-code-research-preview').importance)).toMatchObject({ overview: true, tier: 2 })
  })
  it('keeps the intended product and developer-tool calibration under modest weight changes', () => {
    for (const weights of [WEIGHTS, { influence: 0.30, adoption: 0.30, capability: 0.25, society: 0.15 }, { influence: 0.40, adoption: 0.25, capability: 0.25, society: 0.10 }]) {
      const calculate = (slug) => {
        const e = event(slug)
        const a = e.importance.assessments.find((a) => a.id === e.importance.current)
        return Math.round(20 * Object.entries(weights).reduce((sum, [key, weight]) => sum + weight * a.dimensions[key].rating, 0))
      }
      expect(calculate('chatgpt-launch')).toBeGreaterThan(calculate('openai-gpt-4'))
      expect(calculate('claude-code-research-preview')).toBeGreaterThanOrEqual(65)
      expect(calculate('eu-ai-act-enters-force')).toBeGreaterThanOrEqual(65)
    }
  })
})
