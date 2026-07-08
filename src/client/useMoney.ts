import { trpc } from './trpc'
import { formatDate, type DateFormat } from '../shared/dateFormat'

export interface MoneyFormat {
  symbol: string
  decimalPlaces: number
  locale: string
  symbolPosition: 'prefix' | 'suffix'
  groupSeparator: string
  decimalSeparator: string
}

/** The household's currency formatting, read from bootstrap context. */
export function useMoney(): MoneyFormat {
  const ctx = trpc.bootstrap.context.useQuery()
  const h = ctx.data?.household
  return {
    symbol: h?.currencySymbol ?? '£',
    decimalPlaces: h?.currencyDecimalPlaces ?? 2,
    locale: h?.locale ?? 'en-GB',
    symbolPosition: (h?.currencySymbolPosition as 'prefix' | 'suffix') ?? 'prefix',
    groupSeparator: h?.currencyGroupSeparator ?? ',',
    decimalSeparator: h?.currencyDecimalSeparator ?? '.',
  }
}

/** A `formatDate` bound to the household's locale + chosen date style. */
export function useFormatDate(): (date: string) => string {
  const ctx = trpc.bootstrap.context.useQuery()
  const h = ctx.data?.household
  const locale = h?.locale ?? 'en-GB'
  const dateFormat = (h?.dateFormat ?? 'medium') as DateFormat
  return (date: string) => formatDate(date, { locale, dateFormat })
}

/** Which weekday the calendar week begins on. */
export function useWeekStart(): 'monday' | 'sunday' {
  const ctx = trpc.bootstrap.context.useQuery()
  return (ctx.data?.household?.weekStart as 'monday' | 'sunday') ?? 'monday'
}
