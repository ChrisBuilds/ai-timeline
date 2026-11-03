/** Days before each month in a non-leap year. */
const CUMULATIVE_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Converts YYYY, YYYY-MM or YYYY-MM-DD to a fractional year.
 * A partial date points at the middle of its period, so "1956-06" sits mid-June
 * and "1950" sits mid-year.
 */
export function toYear(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  if (!m) return y + 0.5
  const daysInYear = isLeap(y) ? 366 : 365
  const leapShift = isLeap(y) && m > 2 ? 1 : 0
  const monthStart = CUMULATIVE_DAYS[m - 1] + leapShift
  const daysInMonth = (CUMULATIVE_DAYS[m] ?? 365) + (isLeap(y) && m >= 2 ? 1 : 0) - monthStart
  const day = d ? d - 0.5 : daysInMonth / 2
  return y + (monthStart + day) / daysInYear
}

/** The current moment as a fractional year, in UTC. */
export function nowYear(now: Date = new Date()): number {
  const y = now.getUTCFullYear()
  const start = Date.UTC(y, 0, 1)
  const end = Date.UTC(y + 1, 0, 1)
  return y + (now.getTime() - start) / (end - start)
}
