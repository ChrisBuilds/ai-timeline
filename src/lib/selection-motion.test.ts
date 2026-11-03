import { describe, it, expect } from 'vitest'
import { selectionScroll } from './selection-motion'

describe('keeping a selection in the visible context', () => {
  it('leaves a card in place when expansion already fits above the sheet', () => {
    expect(selectionScroll(100, 188, 78, 364)).toBe(0)
  })
  it('moves a low card only as far as necessary, rather than to the toolbar', () => {
    expect(selectionScroll(450, 188, 78, 364)).toBe(274)
    expect(450 - selectionScroll(450, 188, 78, 364)).toBe(176)
  })
  it('reveals a card obscured by the sticky toolbar', () => {
    expect(selectionScroll(20, 188, 78, 364)).toBe(-58)
  })
  it('keeps the title below the toolbar if the whole card cannot fit', () => {
    expect(selectionScroll(300, 188, 130, 280)).toBe(170)
  })
})
