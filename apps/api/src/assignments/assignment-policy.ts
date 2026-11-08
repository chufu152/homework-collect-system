export interface RosterStudent {
  id: string
  studentNo: string
  name: string
}

export type StudentResolution =
  | { kind: 'matched'; student: RosterStudent }
  | { kind: 'ambiguous' }
  | { kind: 'not-found' }

export function resolveStudent(
  roster: readonly RosterStudent[],
  identity: { studentNo?: string; name?: string },
): StudentResolution {
  const studentNo = identity.studentNo?.trim()
  const name = identity.name?.trim()
  if (studentNo) {
    const student = roster.find((candidate) => candidate.studentNo === studentNo)
    if (!student || (name && student.name !== name)) return { kind: 'not-found' }
    return { kind: 'matched', student }
  }
  if (!name) return { kind: 'not-found' }
  const matches = roster.filter((candidate) => candidate.name === name)
  if (matches.length > 1) return { kind: 'ambiguous' }
  if (matches.length === 0) return { kind: 'not-found' }
  return { kind: 'matched', student: matches[0] }
}

export type SubmissionStatus = 'missing' | 'submitted' | 'late'

export function getSubmissionStatus(
  submittedAt: Date | null,
  dueAt: Date | null,
): SubmissionStatus {
  if (!submittedAt) return 'missing'
  if (dueAt && submittedAt.getTime() > dueAt.getTime()) return 'late'
  return 'submitted'
}

function safeSegment(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[<>:"/\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/\.\.+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
}

export function formatSafeFolderName(studentNo: string, name: string, assignmentTitle: string): string {
  return [studentNo, name, assignmentTitle]
    .map(safeSegment)
    .filter(Boolean)
    .join('-')
}
