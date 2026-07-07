import { describe, it, expect } from 'vitest'
import { normalizeComponentDraft } from './payslipDraft'

describe('normalizeComponentDraft', () => {
  it('trims surrounding whitespace from the name', () => {
    const out = normalizeComponentDraft({ name: '  Basic Pay  ', kind: 'earning', isVariable: false })
    expect(out?.name).toBe('Basic Pay')
  })

  it('rejects an empty or whitespace-only name', () => {
    expect(normalizeComponentDraft({ name: '', kind: 'earning', isVariable: false })).toBeNull()
    expect(normalizeComponentDraft({ name: '   ', kind: 'deduction', isVariable: false })).toBeNull()
  })

  it('keeps isVariable for earnings', () => {
    const out = normalizeComponentDraft({ name: 'Bonus', kind: 'earning', isVariable: true })
    expect(out).toEqual({ name: 'Bonus', kind: 'earning', isVariable: true })
  })

  it('forces isVariable false on a deduction even if requested true', () => {
    const out = normalizeComponentDraft({ name: 'Income Tax', kind: 'deduction', isVariable: true })
    expect(out?.isVariable).toBe(false)
  })

  it('forces isVariable false on employer_info even if requested true', () => {
    const out = normalizeComponentDraft({ name: 'Employer Pension', kind: 'employer_info', isVariable: true })
    expect(out?.isVariable).toBe(false)
  })

  it('leaves a non-variable earning as non-variable', () => {
    const out = normalizeComponentDraft({ name: 'Basic Pay', kind: 'earning', isVariable: false })
    expect(out?.isVariable).toBe(false)
  })
})
