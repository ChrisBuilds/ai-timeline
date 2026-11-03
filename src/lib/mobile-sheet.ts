interface SheetOptions {
  content: () => HTMLElement | undefined
  reducedMotion: () => boolean
  onclose: () => void
}

interface DragState {
  id: number
  handle: HTMLElement
  start: number
  offset: number
  last: number
  time: number
  velocity: number
  moved: boolean
}

/** Independent content scrolling and a pointer-captured, downward dismissal handle. */
export function mobileSheet(node: HTMLElement, options: SheetOptions) {
  let drag: DragState | null = null
  let distance = Number.parseFloat(node.style.translate.split(/\s+/)[1] ?? '0') || 0
  let suppressClick = false
  let snap: Animation | undefined
  let touchY: number | null = null
  const isHandle = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-sheet-handle]')
  const translate = (y: number) => { distance = y; node.style.translate = `0px ${y}px` }

  function settle() {
    const from = distance
    translate(0)
    if (from && !options.reducedMotion()) {
      snap = node.animate([{ translate: `0px ${from}px` }, { translate: '0px 0px' }], {
        duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards',
      })
      snap.finished.catch(() => {})
    }
  }

  function resume() {
    // A bidirectional Svelte transition may revive the sheet before its drag
    // dismissal finishes. Ease the retained drag offset back into place too.
    if (!drag && distance) settle()
  }

  function start(e: PointerEvent) {
    const handle = isHandle(e.target) as HTMLElement | null
    if (!handle || innerWidth >= 720 || !e.isPrimary || e.button !== 0 || drag) return
    e.preventDefault()
    suppressClick = false
    // Preserve the visible position if the handle is grabbed during entry or snap-back.
    const offset = Math.max(0, node.getBoundingClientRect().top - (innerHeight - node.offsetHeight))
    for (const animation of node.getAnimations()) {
      if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish()
    }
    translate(offset)
    drag = { id: e.pointerId, handle, start: e.clientY, offset, last: offset, time: e.timeStamp, velocity: 0, moved: false }
    node.dataset.dragging = ''
    handle.setPointerCapture(e.pointerId)
  }

  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return
    e.preventDefault()
    const next = Math.max(0, drag.offset + e.clientY - drag.start)
    const elapsed = e.timeStamp - drag.time
    drag.velocity = elapsed > 0 && elapsed < 100 ? (next - drag.last) / elapsed : 0
    drag.last = next
    drag.time = e.timeStamp
    drag.moved ||= Math.abs(e.clientY - drag.start) > 5
    translate(next)
  }

  function end(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return
    const current = drag
    drag = null
    delete node.dataset.dragging
    suppressClick = current.moved || e.type !== 'pointerup'
    if (current.handle.hasPointerCapture(e.pointerId)) current.handle.releasePointerCapture(e.pointerId)
    const velocity = e.timeStamp - current.time < 100 ? current.velocity : 0
    // A quarter-sheet pull or deliberate flick dismisses; tiny jitters do not.
    const dismiss = e.type === 'pointerup' &&
      (distance >= Math.max(64, node.offsetHeight * 0.25) || (distance > 24 && velocity > 0.6))
    if (dismiss) options.onclose()
    else settle()
  }

  function click(e: MouseEvent) {
    if (isHandle(e.target) && e.detail !== 0 && suppressClick) {
      suppressClick = false
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }

  const atEdge = (delta: number) => {
    const content = options.content()
    if (!content) return true
    return delta < 0 ? content.scrollTop <= 1 :
      delta > 0 && content.scrollTop + content.clientHeight >= content.scrollHeight - 1
  }
  function wheel(e: WheelEvent) {
    e.stopPropagation() // Ctrl-wheel inside details must not zoom the timeline.
    if (e.ctrlKey || !e.deltaY) return
    if (isHandle(e.target)) {
      e.preventDefault()
      const content = options.content()
      content?.scrollBy({ top: e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? content.clientHeight : 1), behavior: 'instant' })
    } else if (atEdge(e.deltaY)) e.preventDefault()
  }
  function touchStart(e: TouchEvent) {
    touchY = e.touches.length === 1 ? e.touches[0].clientY : null
  }
  function touchMove(e: TouchEvent) {
    e.stopPropagation()
    if (e.touches.length !== 1 || touchY === null) return
    const y = e.touches[0].clientY
    // CSS contains overscroll; this also covers short sheets and older touch browsers.
    if (isHandle(e.target) || atEdge(touchY - y)) e.preventDefault()
    touchY = y
  }

  node.addEventListener('introstart', resume)
  node.addEventListener('pointerdown', start)
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerup', end)
  node.addEventListener('pointercancel', end)
  node.addEventListener('lostpointercapture', end)
  node.addEventListener('click', click, true)
  node.addEventListener('wheel', wheel, { passive: false })
  node.addEventListener('touchstart', touchStart, { passive: true })
  node.addEventListener('touchmove', touchMove, { passive: false })
  return {
    destroy() {
      node.removeEventListener('introstart', resume)
      node.removeEventListener('pointerdown', start)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', end)
      node.removeEventListener('pointercancel', end)
      node.removeEventListener('lostpointercapture', end)
      node.removeEventListener('click', click, true)
      node.removeEventListener('wheel', wheel)
      node.removeEventListener('touchstart', touchStart)
      node.removeEventListener('touchmove', touchMove)
      snap?.cancel()
      // Keep the dragged offset while Svelte runs the exit transition.
    },
  }
}
