interface ScrollOptions {
  content?: () => HTMLElement | undefined
  handle?: (target: EventTarget | null) => boolean
}

/** Keep wheel/touch gestures in a panel, including when its contents cannot scroll. */
export function containScroll(node: HTMLElement, options: ScrollOptions = {}) {
  const content = options.content ?? (() => node)
  const isHandle = options.handle ?? (() => false)
  let touchY: number | null = null
  const atEdge = (delta: number) => {
    const scroller = content()
    if (!scroller) return true
    return delta < 0 ? scroller.scrollTop <= 1 :
      delta > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
  }
  function wheel(e: WheelEvent) {
    e.stopPropagation()
    if (e.ctrlKey || !e.deltaY) return
    if (isHandle(e.target)) {
      e.preventDefault()
      const scroller = content()
      scroller?.scrollBy({ top: e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1), behavior: 'instant' })
    } else if (atEdge(e.deltaY)) e.preventDefault()
  }
  function start(e: TouchEvent) {
    touchY = e.touches.length === 1 ? e.touches[0].clientY : null
  }
  function move(e: TouchEvent) {
    e.stopPropagation()
    if (e.touches.length !== 1 || touchY === null) return
    const y = e.touches[0].clientY
    if (isHandle(e.target) || atEdge(touchY - y)) e.preventDefault()
    touchY = y
  }
  node.addEventListener('wheel', wheel, { passive: false })
  node.addEventListener('touchstart', start, { passive: true })
  node.addEventListener('touchmove', move, { passive: false })
  return { destroy() {
    node.removeEventListener('wheel', wheel)
    node.removeEventListener('touchstart', start)
    node.removeEventListener('touchmove', move)
  } }
}
