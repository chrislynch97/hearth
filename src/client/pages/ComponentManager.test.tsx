import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import type { PayslipComponentType } from '../../server/db/schema'

// Stable spies shared with the mocked trpc module (vi.mock is hoisted).
const mocks = vi.hoisted(() => ({
  updateMutate: vi.fn().mockResolvedValue({}),
  createMutate: vi.fn().mockResolvedValue({}),
  archiveMutate: vi.fn().mockResolvedValue(undefined),
  invalidate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../trpc', () => {
  const mutation = (mutateAsync: unknown) => ({ useMutation: () => ({ mutateAsync, isPending: false, error: null }) })
  return {
    trpc: {
      useUtils: () => ({
        payslipComponents: { list: { invalidate: mocks.invalidate } },
        income: { overview: { invalidate: mocks.invalidate } },
      }),
      payslipComponents: {
        create: mutation(mocks.createMutate),
        update: mutation(mocks.updateMutate),
        archive: mutation(mocks.archiveMutate),
      },
    },
  }
})

// Imported after the mock is registered.
import { ComponentManager } from './PayslipsPage'

function comp(over: Partial<PayslipComponentType>): PayslipComponentType {
  return {
    id: 'c1',
    ownerId: 'owner-1',
    name: 'Basic Pay',
    kind: 'earning',
    isVariable: 0,
    sortOrder: 0,
    archivedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function renderManager(components: PayslipComponentType[]) {
  return render(
    <MantineProvider>
      <ComponentManager ownerId="owner-1" components={components} />
    </MantineProvider>,
  )
}

beforeEach(() => {
  mocks.updateMutate.mockClear()
})

describe('ComponentManager', () => {
  it('lists the existing components', () => {
    renderManager([
      comp({ id: 'c1', name: 'Basic Pay', kind: 'earning' }),
      comp({ id: 'c2', name: 'Income Tax', kind: 'deduction' }),
    ])
    expect(screen.getByText('Basic Pay')).toBeInTheDocument()
    expect(screen.getByText('Income Tax')).toBeInTheDocument()
  })

  it('saving an edit persists name, kind and isVariable — not just the name', async () => {
    // A variable earning: the editor should preselect its kind and show the
    // Variable switch as checked, and Save must send the whole draft.
    renderManager([comp({ id: 'c1', name: 'Bonus', kind: 'earning', isVariable: 1 })])

    fireEvent.click(screen.getByLabelText('Edit Bonus'))
    const editor = within(screen.getByRole('group', { name: 'Edit component' }))
    expect(editor.getByLabelText('Variable')).toBeChecked()

    fireEvent.change(editor.getByLabelText('Component name'), { target: { value: 'Annual Bonus' } })
    fireEvent.click(editor.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mocks.updateMutate).toHaveBeenCalledWith({
        id: 'c1',
        name: 'Annual Bonus',
        kind: 'earning',
        isVariable: true,
      }),
    )
  })

  it('does not offer the Variable switch for a deduction and saves isVariable false', async () => {
    renderManager([comp({ id: 'c2', name: 'Income Tax', kind: 'deduction', isVariable: 0 })])

    fireEvent.click(screen.getByLabelText('Edit Income Tax'))
    const editor = within(screen.getByRole('group', { name: 'Edit component' }))
    expect(editor.queryByLabelText('Variable')).toBeNull()

    fireEvent.click(editor.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mocks.updateMutate).toHaveBeenCalledWith({
        id: 'c2',
        name: 'Income Tax',
        kind: 'deduction',
        isVariable: false,
      }),
    )
  })

  it('does not save when the name is cleared', async () => {
    renderManager([comp({ id: 'c1', name: 'Basic Pay', kind: 'earning' })])

    fireEvent.click(screen.getByLabelText('Edit Basic Pay'))
    const editor = within(screen.getByRole('group', { name: 'Edit component' }))
    fireEvent.change(editor.getByLabelText('Component name'), { target: { value: '   ' } })
    fireEvent.click(editor.getByRole('button', { name: 'Save' }))

    // Give any (unexpected) async work a chance to run, then assert nothing was sent.
    await Promise.resolve()
    expect(mocks.updateMutate).not.toHaveBeenCalled()
  })
})
