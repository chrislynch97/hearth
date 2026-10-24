/** Pure gift-budget arithmetic. All values are integer minor units. A gift
 *  counts as spent once it's bought (or given); ideas are only planned. */

export const GIFT_STATUSES = ['idea', 'bought', 'given'] as const
export type GiftStatus = (typeof GIFT_STATUSES)[number]

export interface GiftLike {
  amount: number
  status: string
}

export interface GiftTotals {
  /** Null when no budget is set — nothing to measure against. */
  budget: number | null
  spent: number
  planned: number
  /** budget − spent; negative when over. Null without a budget. */
  left: number | null
}

export function giftTotals(budget: number | null, gifts: GiftLike[]): GiftTotals {
  let spent = 0
  let planned = 0
  for (const g of gifts) {
    if (g.status === 'idea') planned += g.amount
    else spent += g.amount
  }
  return { budget, spent, planned, left: budget === null ? null : budget - spent }
}

/** What the people's own budgets add up to; anyone without one adds nothing. */
export function allocatedBudget(recipients: Array<{ budget: number | null }>): number {
  return recipients.reduce((sum, r) => sum + (r.budget ?? 0), 0)
}

/** The occasion budget the people's budgets need: raised to their total when
 *  they'd go past it. No occasion budget means there's nothing to go past. */
export function budgetCovering(occasionBudget: number | null, allocated: number): number | null {
  return occasionBudget === null || allocated <= occasionBudget ? occasionBudget : allocated
}
