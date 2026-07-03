import { describe, it, expect } from 'vitest'
import { projectUpcoming } from './upcoming'

describe('projectUpcoming', () => {
  it('projects monthly occurrences across the window on the anchor day-of-month', () => {
    const out = projectUpcoming({
      expenses: [{ id: 'e1', name: 'Rent', recurrence: 'monthly', dueAnchor: '2026-06-15', amount: 120000 }],
      from: '2026-06-01',
      to: '2026-08-31',
    })
    expect(out.map((o) => o.date)).toEqual(['2026-06-15', '2026-07-15', '2026-08-15'])
    expect(out.every((o) => o.amount === 120000 && o.name === 'Rent')).toBe(true)
  })

  it('does not drift on month-end anchors (recomputes from the anchor)', () => {
    const out = projectUpcoming({
      expenses: [{ id: 'e1', name: 'Bill', recurrence: 'monthly', dueAnchor: '2026-01-31', amount: 1000 }],
      from: '2026-02-01',
      to: '2026-04-30',
    })
    // Feb clamps to 28, but March must be 31 again (not 28) — proves no drift.
    expect(out.map((o) => o.date)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('includes an earlier occurrence when the anchor is in the future', () => {
    const out = projectUpcoming({
      expenses: [{ id: 'e1', name: 'Quarterly', recurrence: 'quarterly', dueAnchor: '2026-09-10', amount: 5000 }],
      from: '2026-05-01',
      to: '2026-07-31',
    })
    expect(out.map((o) => o.date)).toEqual(['2026-06-10']) // 2026-09-10 minus one quarter
  })

  it('projects yearly and excludes occurrences outside the window', () => {
    const out = projectUpcoming({
      expenses: [{ id: 'e1', name: 'Insurance', recurrence: 'yearly', dueAnchor: '2026-12-25', amount: 16900 }],
      from: '2026-06-01',
      to: '2027-01-31',
    })
    expect(out.map((o) => o.date)).toEqual(['2026-12-25'])
  })

  it('skips expenses without an anchor and sorts the merged list by date', () => {
    const out = projectUpcoming({
      expenses: [
        { id: 'e1', name: 'Later', recurrence: 'monthly', dueAnchor: '2026-06-20', amount: 100 },
        { id: 'e2', name: 'Earlier', recurrence: 'monthly', dueAnchor: '2026-06-05', amount: 200 },
        { id: 'e3', name: 'NoAnchor', recurrence: 'monthly', dueAnchor: null, amount: 300 },
      ],
      from: '2026-06-01',
      to: '2026-06-30',
    })
    expect(out.map((o) => o.name)).toEqual(['Earlier', 'Later'])
  })

  it('reports days until each occurrence relative to `from`', () => {
    const out = projectUpcoming({
      expenses: [{ id: 'e1', name: 'Rent', recurrence: 'monthly', dueAnchor: '2026-06-15', amount: 1 }],
      from: '2026-06-10',
      to: '2026-06-30',
    })
    expect(out[0]?.daysUntil).toBe(5)
  })

  it('flags due-soon within the reminder window (or the 7-day default)', () => {
    const [defaulted] = projectUpcoming({
      expenses: [{ id: 'e1', name: 'A', recurrence: 'monthly', dueAnchor: '2026-06-16', amount: 1 }],
      from: '2026-06-10',
      to: '2026-06-30',
    })
    expect(defaulted?.dueSoon).toBe(true) // 6 days ≤ default 7

    const [tight] = projectUpcoming({
      expenses: [{ id: 'e1', name: 'A', recurrence: 'monthly', dueAnchor: '2026-06-16', amount: 1, reminderDays: 3 }],
      from: '2026-06-10',
      to: '2026-06-30',
    })
    expect(tight?.dueSoon).toBe(false) // 6 days > custom 3
  })
})
