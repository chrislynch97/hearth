/** Pure, UI-framework-free helpers for payslip-component drafts.
 *  Kept separate from the React page so the rules can be unit-tested directly. */

export type ComponentKind = 'earning' | 'deduction' | 'employer_info'

export interface ComponentDraft {
  name: string
  kind: ComponentKind
  isVariable: boolean
}

/** Normalise a component draft for create/update, applying the domain rules:
 *  - the name is trimmed and must be non-empty (else the draft is invalid → null);
 *  - `isVariable` only means anything on earnings, so it is forced false for any
 *    other kind. This stops a stale "variable" flag lingering when a line is
 *    reclassified (e.g. an earning marked variable is switched to a deduction). */
export function normalizeComponentDraft(draft: ComponentDraft): ComponentDraft | null {
  const name = draft.name.trim()
  if (!name) return null
  return {
    name,
    kind: draft.kind,
    isVariable: draft.kind === 'earning' ? draft.isVariable : false,
  }
}
