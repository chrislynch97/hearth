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
  return Math.round(parseFloat(shifted))
}

export function fromMinor(minor: number, decimalPlaces: number): number {
  return minor / 10 ** decimalPlaces
}

/**
 * Format minor units as a currency string.
 * Uses a deterministic decimal-string approach (no toLocaleString) so output is
 * consistent regardless of the Node ICU build.
 */
export function formatMoney(
  minor: number,
  opts: { symbol: string; decimalPlaces: number; locale: string },
): string {
  const sign = minor < 0 ? '-' : ''
  const absMinor = Math.abs(minor)
  const factor = 10 ** opts.decimalPlaces
  const intPart = Math.floor(absMinor / factor)
  const fracPart = absMinor % factor

  const intStr = intPart.toString()
  const fracStr = opts.decimalPlaces > 0
    ? '.' + fracPart.toString().padStart(opts.decimalPlaces, '0')
    : ''

  return `${sign}${opts.symbol}${intStr}${fracStr}`
}

/** Split `total` (minor units) across `weights`, largest-remainder so the parts sum to exactly `total`. */
export function allocate(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0)
  if (weightSum === 0 || total === 0) return weights.map(() => 0)
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
