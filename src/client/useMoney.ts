import { trpc } from './trpc'

export interface MoneyFormat {
  symbol: string
  decimalPlaces: number
  locale: string
}

/** The household's currency formatting, read from bootstrap context. */
export function useMoney(): MoneyFormat {
  const ctx = trpc.bootstrap.context.useQuery()
  const h = ctx.data?.household
  return {
    symbol: h?.currencySymbol ?? '£',
    decimalPlaces: h?.currencyDecimalPlaces ?? 2,
    locale: h?.locale ?? 'en-GB',
  }
}
