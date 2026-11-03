import type { Category } from './types'

/** CSS custom property holding a category's colour. Values live in app.css. */
export function categoryColor(category: Category | string): string {
  return `var(--cat-${category.replace(/\s+/g, '-')}, var(--muted))`
}
