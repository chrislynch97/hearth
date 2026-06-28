export interface CurrencyPreset {
  code: string
  symbol: string
  decimalPlaces: number
  label: string
}

export const CURRENCIES: CurrencyPreset[] = [
  { code: 'GBP', symbol: '£', decimalPlaces: 2, label: 'British Pound (£)' },
  { code: 'USD', symbol: '$', decimalPlaces: 2, label: 'US Dollar ($)' },
  { code: 'EUR', symbol: '€', decimalPlaces: 2, label: 'Euro (€)' },
  { code: 'JPY', symbol: '¥', decimalPlaces: 0, label: 'Japanese Yen (¥)' },
]

export function findCurrency(code: string): CurrencyPreset | undefined {
  return CURRENCIES.find((c) => c.code === code)
}
