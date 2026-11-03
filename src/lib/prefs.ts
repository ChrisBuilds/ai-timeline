// Display settings, saved per browser. index.html applies the saved values
// before first paint so the page doesn't flash the wrong theme.

export type Theme = 'system' | 'light' | 'dark'
export type Motion = 'system' | 'reduce' | 'full'

const KEY = 'ai-timeline:prefs'

export interface Prefs {
  theme: Theme
  motion: Motion
}

export const DEFAULT_PREFS: Prefs = { theme: 'system', motion: 'system' }

export function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      theme: ['light', 'dark'].includes(saved.theme) ? saved.theme : 'system',
      motion: ['reduce', 'full'].includes(saved.motion) ? saved.motion : 'system',
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Storage can be blocked; the setting still applies for this visit.
  }
}

export function applyPrefs(p: Prefs, root = document.documentElement) {
  if (p.theme === 'system') delete root.dataset.theme
  else root.dataset.theme = p.theme
  if (p.motion === 'system') delete root.dataset.motion
  else root.dataset.motion = p.motion
}

export function prefersReducedMotion(p: Prefs): boolean {
  if (p.motion !== 'system') return p.motion === 'reduce'
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
