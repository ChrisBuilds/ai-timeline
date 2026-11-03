import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, formatHash, parseHash } from './url'

describe('parseHash', () => {
  it('reads an empty hash as the default view', () => {
    expect(parseHash('')).toEqual({ event: null, zoom: 1 })
  })
  it('reads old bare event links', () => {
    expect(parseHash('#2024-09-12-openai-o1')).toEqual({ event: '2024-09-12-openai-o1', zoom: 1 })
  })
  it('reads event and zoom', () => {
    expect(parseHash('#e=2024-09-12-openai-o1&z=3.5')).toEqual({ event: '2024-09-12-openai-o1', zoom: 3.5 })
  })
  it('clamps silly zoom values', () => {
    expect(parseHash('#z=9999').zoom).toBe(MAX_ZOOM)
    expect(parseHash('#z=abc').zoom).toBe(1)
  })
})

describe('formatHash', () => {
  it('round-trips', () => {
    const state = { event: '2022-11-30-chatgpt-launch', zoom: 2.25 }
    expect(parseHash(formatHash(state))).toEqual(state)
  })
  it('leaves out defaults', () => {
    expect(formatHash({ event: null, zoom: 1 })).toBe('')
  })
})
