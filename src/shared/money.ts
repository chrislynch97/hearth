/** Money is stored as integer minor units (e.g. pence). These helpers convert at the UI edge. */

export function toMinor(major: number, decimalPlaces: number): number {
  // Parse via string to avoid IEEE-754 drift (e.g. 1.005 * 100 = 100.49999…).
  // Shift the decimal point in the string representation, then parseInt.
  const str = major.toFixed(decimalPlaces + 4) // extra digits to avoid premature rounding
  const dotIdx = str.indexOf('.')
  const digits = str.replace('.', '')
  // Position of the new decimal point after shifting by decimalPlaces
  const newDotIdx = dotIdx + decimalPlaces
  const shifted = digits.slice(0, newDotIdx) + '.' + digits.slice(newDotIdx)
  // Round half away from zero (Math.round rounds toward +∞, which biases negative ties).
  const parsed = parseFloat(shifted)
  const result = Math.sign(parsed) * Math.round(Math.abs(parsed))
  // Normalise -0 to 0.
  return result === 0 ? 0 : result
}

export function fromMinor(minor: number, decimalPlaces: number): number {
  return minor / 10 ** decimalPlaces
}

/**
 * Format minor units as a currency string.
 * Uses a deterministic decimal-string approach (no toLocaleString) so output is
 * consistent regardless of the Node ICU build. Symbol placement and separators
 * are configurable (household settings); the defaults reproduce the classic
 * `£1,234.56` shape, and `suffix` gives `1.234,56 €` (symbol after a space).
 */
export function formatMoney(
  minor: number,
  opts: {
    symbol: string
    decimalPlaces: number
    locale?: string
    symbolPosition?: 'prefix' | 'suffix'
    groupSeparator?: string
    decimalSeparator?: string
  },
): string {
  const groupSeparator = opts.groupSeparator ?? ','
  const decimalSeparator = opts.decimalSeparator ?? '.'
  const symbolPosition = opts.symbolPosition ?? 'prefix'

  const sign = minor < 0 ? '-' : ''
  const absMinor = Math.abs(minor)
  const factor = 10 ** opts.decimalPlaces
  const intPart = Math.floor(absMinor / factor)
  const fracPart = absMinor % factor

  // Group the integer part in threes (deterministic; no toLocaleString).
  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator)
  const fracStr = opts.decimalPlaces > 0
    ? decimalSeparator + fracPart.toString().padStart(opts.decimalPlaces, '0')
    : ''
  const number = `${intStr}${fracStr}`

  // Sign always leads. Suffix keeps a non-breaking space (\u00A0) before the
  // symbol so the amount never wraps away from its currency.
  return symbolPosition === 'suffix'
    ? `${sign}${number}\u00A0${opts.symbol}`
    : `${sign}${opts.symbol}${number}`
}

/** Rescale a minor-units amount when the currency's decimal places change.
 *  Increasing places is exact; decreasing rounds half away from zero (lossy). */
export function rescaleMinor(amount: number, fromDecimalPlaces: number, toDecimalPlaces: number): number {
  const delta = toDecimalPlaces - fromDecimalPlaces
  if (delta === 0) return amount
  if (delta > 0) return amount * 10 ** delta
  const factor = 10 ** -delta
  const scaled = amount / factor
  const result = Math.sign(scaled) * Math.round(Math.abs(scaled))
  return result === 0 ? 0 : result
}

/** Split `total` (minor units) across `weights`, largest-remainder so the parts sum to exactly `total`. */
export function allocate(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0)
  if (weightSum === 0 || total === 0) return weights.map(() => 0)
  // For negative totals, compute on the magnitude and reapply the sign so that
  // the largest-remainder fix-up logic (which relies on remainder > 0) works correctly.
  if (total < 0) {
    return allocate(-total, weights).map((p) => (p === 0 ? 0 : -p))
  }
  const raw = weights.map((w) => (total * w) / weightSum)
  const floors = raw.map((r) => Math.floor(r))
  let remainder = total - floors.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  const result = [...floors]
  for (const { i } of order) {
    if (remainder <= 0) break
    result[i] = (result[i] ?? 0) + 1
    remainder -= 1
  }
  return result
}
