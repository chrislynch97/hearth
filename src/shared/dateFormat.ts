/** Locale-aware formatting for calendar dates (`YYYY-MM-DD` text — a *day*, not
 *  a moment). The household picks a style; ISO is the raw stored value. */

export type DateFormat = 'iso' | 'numeric' | 'medium' | 'long'

const STYLES: Record<Exclude<DateFormat, 'iso'>, Intl.DateTimeFormatOptions> = {
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
}

/** Format a `YYYY-MM-DD` string for display. Falls back to the raw string for
 *  empty/malformed input so a bad value is visible, never a crash or "Invalid Date". */
export function formatDate(date: string, opts: { locale: string; dateFormat: DateFormat }): string {
  if (!date) return ''
  if (opts.dateFormat === 'iso') return date
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  // Construct in local time from parts so the calendar day never shifts by TZ.
  const dt = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat(opts.locale, STYLES[opts.dateFormat]).format(dt)
}
