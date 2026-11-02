import { describe, it, expect } from 'vitest'
import { comparePriority } from './priority'

describe('comparePriority', () => {
  it('puts urgent first and unknown values last', () => {
    expect(['low', 'mystery', 'high', 'normal'].sort(comparePriority)).toEqual(['high', 'normal', 'low', 'mystery'])
  })
})
