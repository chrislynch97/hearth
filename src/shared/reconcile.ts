// A reconciliation batch with no transactions in it is a residual being settled
// rather than spends being cleared, and there are two ways that happens. The note
// is what tells them apart afterwards — the row shapes are otherwise identical
// (`totalAmount` 0, `movedAmount` carrying the amount), so history can't infer it.

/** The shortfall was given up on: it stops being owed without being paid. */
export const WRITE_OFF_NOTE = 'Residual written off'

/** Some of the shortfall was actually moved; the rest stays owed. */
export const PART_PAY_NOTE = 'Residual paid down'
