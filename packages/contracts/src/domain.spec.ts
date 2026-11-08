import { describe, expect, it } from 'vitest'
import {
  formatMissingMentions,
  isAssignmentState,
  isAssignmentType,
  uniqueTargetIds,
} from './domain'

describe('assignment domain values', () => {
  it('accepts only the planned assignment types and states', () => {
    expect(isAssignmentType('online')).toBe(true)
    expect(isAssignmentType('relay')).toBe(true)
    expect(isAssignmentType('homework')).toBe(false)
    expect(isAssignmentState('published')).toBe(true)
    expect(isAssignmentState('closed')).toBe(true)
    expect(isAssignmentState('archived')).toBe(false)
  })
})

describe('target selection', () => {
  it('deduplicates target ids while preserving their first-seen order', () => {
    expect(uniqueTargetIds(['s-1', 's-2', 's-1', 's-3', 's-2'])).toEqual([
      's-1',
      's-2',
      's-3',
    ])
  })
})

describe('missing mention formatting', () => {
  it('trims, removes empty and duplicate names, and preserves roster order', () => {
    expect(formatMissingMentions([' 张三 ', '', '李四', '张三', ' 王五'])).toBe(
      '@张三 @李四 @王五',
    )
  })
})
