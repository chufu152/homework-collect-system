import { describe, expect, it } from 'vitest'
import { formatSafeFolderName, getSubmissionStatus, resolveStudent } from './assignment-policy.js'

describe('student resolution', () => {
  const roster = [
    { id: 's1', studentNo: '1001', name: '张三' },
    { id: 's2', studentNo: '1002', name: '李四' },
    { id: 's3', studentNo: '1003', name: '张三' },
  ]

  it('requires the student number when a name matches multiple roster entries', () => {
    expect(resolveStudent(roster, { name: '张三' })).toEqual({ kind: 'ambiguous' })
    expect(resolveStudent(roster, { name: '张三', studentNo: '1003' })).toEqual({
      kind: 'matched',
      student: roster[2],
    })
  })
})

describe('submission status', () => {
  it('distinguishes missing, submitted, and late submissions', () => {
    const dueAt = new Date('2026-11-10T00:00:00.000Z')
    expect(getSubmissionStatus(null, dueAt)).toBe('missing')
    expect(getSubmissionStatus(new Date('2026-11-09T20:00:00.000Z'), dueAt)).toBe('submitted')
    expect(getSubmissionStatus(new Date('2026-11-10T01:00:00.000Z'), dueAt)).toBe('late')
  })
})

describe('student folder names', () => {
  it('removes path control characters from names before building the folder path', () => {
    expect(formatSafeFolderName('1001', '张三', '../周测:二')).toBe('1001-张三-周测-二')
  })
})
