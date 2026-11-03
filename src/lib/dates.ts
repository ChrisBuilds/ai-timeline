const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Formats YYYY, YYYY-MM or YYYY-MM-DD at its own precision, without time zone shifts. */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-')
  if (!m) return y
  const month = MONTHS[Number(m) - 1]
  return d ? `${month} ${Number(d)}, ${y}` : `${month} ${y}`
}

export function formatRange(date: string, end?: string): string {
  return end ? `${formatDate(date)} to ${formatDate(end)}` : formatDate(date)
}
