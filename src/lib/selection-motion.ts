/** Selection-only layout animation. Zoom and scrolling keep their existing fast path. */
export const SELECTION_DURATION = 360
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

interface ItemSnapshot {
  rect: DOMRect
  background?: string
  color?: string
}
export interface SelectionSnapshot {
  rect: DOMRect
  items: Map<string, ItemSnapshot>
}

export function captureSelection(root: HTMLElement): SelectionSnapshot {
  const items = new Map<string, ItemSnapshot>()
  for (const node of root.querySelectorAll<HTMLElement>('[data-motion-key]')) {
    const style = node.matches('.card, .event-group') ? getComputedStyle(node) : null
    items.set(node.dataset.motionKey!, {
      rect: node.getBoundingClientRect(),
      background: style?.backgroundColor,
      color: style?.color,
    })
  }
  return { rect: root.getBoundingClientRect(), items }
}

/**
 * FLIP from the last painted positions after layout and scroll have settled.
 * Animate real card dimensions rather than scaling text. Translate the parent
 * for scroll compensation and its children only for their local layout changes.
 */
export function animateSelection(root: HTMLElement, before: SelectionSnapshot): () => void {
  const animations: Animation[] = []
  const after = root.getBoundingClientRect()
  const dx = before.rect.left - after.left
  const dy = before.rect.top - after.top
  const play = (node: Element, frames: Keyframe[], delay = 0, duration = SELECTION_DURATION) => {
    const animation = node.animate(frames, { duration, delay, easing: EASING, fill: 'backwards' })
    animation.finished.catch(() => {}) // Cancellation is expected on rapid taps or zoom.
    animations.push(animation)
  }
  // Read every final rectangle before starting any animations: parent transforms
  // must not contaminate the child measurements.
  const updates = [...root.querySelectorAll<HTMLElement>('[data-motion-key]')].map((node) => {
    const style = getComputedStyle(node)
    return {
      node,
      rect: node.getBoundingClientRect(),
      transform: style.transform,
      background: style.backgroundColor,
      color: style.color,
      card: node.matches('.card, .event-group'),
      previous: before.items.get(node.dataset.motionKey!),
    }
  })
  for (const { node, rect, transform, background, color, card, previous } of updates) {
    if (!previous) {
      play(node, [{ opacity: 0 }, { opacity: 1 }], 80, 180)
      continue
    }
    const x = previous.rect.left - rect.left - dx
    const y = previous.rect.top - rect.top - dy
    if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01 && (!card || (
      previous.rect.width === rect.width && previous.rect.height === rect.height &&
      previous.background === background && previous.color === color
    ))) continue
    const baseTransform = transform === 'none' ? '' : transform
    const start: Keyframe = { transform: `translate(${x}px, ${y}px) ${baseTransform}` }
    const end: Keyframe = { transform }
    if (card) {
      start.width = `${previous.rect.width}px`
      start.height = `${previous.rect.height}px`
      start.backgroundColor = previous.background
      start.color = previous.color
      end.width = `${rect.width}px`
      end.height = `${rect.height}px`
      end.backgroundColor = background
      end.color = color
    }
    play(node, [start, end])
  }
  if (Math.abs(dx) >= 0.01 || Math.abs(dy) >= 0.01) play(root, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }])
  return () => animations.forEach((animation) => animation.cancel())
}

/** Minimal scroll necessary to fit a card in the unobscured context area. */
export function selectionScroll(top: number, height: number, visibleTop: number, visibleBottom: number): number {
  const maxTop = Math.max(visibleTop, visibleBottom - height)
  return top - Math.min(maxTop, Math.max(visibleTop, top))
}
