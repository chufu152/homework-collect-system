import { describe, expect, it } from 'vitest'
import { calculateDashboard, partitionIntoGroups, resolveTargetStudents, validateSubmissionAccess } from './workflows.js'

describe('balanced group partitioning', () => {
  it('distributes students across groups without losing members or exceeding one-person difference', () => {
    expect(partitionIntoGroups(['s1', 's2', 's3', 's4', 's5'], 3)).toEqual([
      ['s1', 's4'],
      ['s2', 's5'],
      ['s3'],
    ])
  })
})

describe('assignment audience snapshot', () => {
  const roster = [
    { id: 's1', studentNo: '1001', name: '张三' },
    { id: 's2', studentNo: '1002', name: '李四' },
    { id: 's3', studentNo: '1003', name: '王五' },
  ]

  it('resolves group targets in roster order without duplicate students', () => {
    expect(
      resolveTargetStudents(roster, {
        mode: 'groups',
        groupStudentIds: [['s3', 's1'], ['s1', 's2']],
      }).map((student) => student.id),
    ).toEqual(['s1', 's2', 's3'])
  })

  it('rejects submissions by non-target students and for closed assignments', () => {
    expect(validateSubmissionAccess('published', ['s1', 's2'], 's3')).toBe('not-targeted')
    expect(validateSubmissionAccess('closed', ['s1', 's2'], 's1')).toBe('closed')
    expect(validateSubmissionAccess('published', ['s1', 's2'], 's1')).toBe('allowed')
  })
})

describe('dashboard summary', () => {
  it('counts late submissions as submitted and keeps missing names in roster order', () => {
    const result = calculateDashboard(
      [
        { id: 's1', name: '张三' },
        { id: 's2', name: '李四' },
        { id: 's3', name: '王五' },
      ],
      [
        { studentId: 's1', submittedAt: '2026-11-09T10:00:00.000Z' },
        { studentId: 's2', submittedAt: '2026-11-11T10:00:00.000Z' },
      ],
      '2026-11-10T00:00:00.000Z',
    )
    expect(result).toEqual({
      expected: 3,
      submitted: 2,
      missing: 1,
      late: 1,
      missingStudentIds: ['s3'],
      missingMentionText: '@王五',
    })
  })
})
