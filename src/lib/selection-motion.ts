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
    const style = node.classList.contains('card') ? getComputedStyle(node) : null
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
  const updates = [...root.querySelectorAll<HTMLElement>('[data-motion-key]')].map((node) => ({
    node,
    rect: node.getBoundingClientRect(),
    transform: getComputedStyle(node).transform,
    previous: before.items.get(node.dataset.motionKey!),
  }))
  for (const { node, rect, transform, previous } of updates) {
    if (!previous) {
      play(node, [{ opacity: 0 }, { opacity: 1 }], 80, 180)
      continue
    }
    const x = previous.rect.left - rect.left - dx
    const y = previous.rect.top - rect.top - dy
    const baseTransform = transform === 'none' ? '' : transform
    const start: Keyframe = { transform: `translate(${x}px, ${y}px) ${baseTransform}` }
    const end: Keyframe = { transform }
    if (node.classList.contains('card')) {
      start.width = `${previous.rect.width}px`
      start.height = `${previous.rect.height}px`
      start.backgroundColor = previous.background
      start.color = previous.color
      end.width = `${rect.width}px`
      end.height = `${rect.height}px`
      const style = getComputedStyle(node)
      end.backgroundColor = style.backgroundColor
      end.color = style.color
    }
    play(node, [start, end])
  }
  play(root, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }])
  return () => animations.forEach((animation) => animation.cancel())
}

/** Minimal scroll necessary to fit a card in the unobscured context area. */
export function selectionScroll(top: number, height: number, visibleTop: number, visibleBottom: number): number {
  const maxTop = Math.max(visibleTop, visibleBottom - height)
  return top - Math.min(maxTop, Math.max(visibleTop, top))
}
