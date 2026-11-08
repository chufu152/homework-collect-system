export function partitionIntoGroups<T>(students: readonly T[], groupCount: number): T[][] {
  if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > students.length) {
    throw new RangeError('Group count must be between one and the student count.')
  }
  const groups = Array.from({ length: groupCount }, () => [] as T[])
  students.forEach((student, index) => groups[index % groupCount].push(student))
  return groups
}

export interface AudienceStudent {
  id: string
  name: string
  studentNo?: string
}

export interface AssignmentAudience {
  mode: 'all' | 'groups' | 'students'
  studentIds?: readonly string[]
  groupStudentIds?: readonly (readonly string[])[]
}

export function resolveTargetStudents<T extends AudienceStudent>(
  roster: readonly T[],
  audience: AssignmentAudience,
): T[] {
  if (audience.mode === 'all') return [...roster]

  const selectedIds = new Set(
    audience.mode === 'students'
      ? audience.studentIds ?? []
      : (audience.groupStudentIds ?? []).flat(),
  )
  return roster.filter((student) => selectedIds.has(student.id))
}

export type SubmissionAccess = 'allowed' | 'closed' | 'not-targeted'

export function validateSubmissionAccess(
  assignmentState: 'draft' | 'published' | 'closed',
  targetStudentIds: readonly string[],
  studentId: string,
): SubmissionAccess {
  if (assignmentState !== 'published') return 'closed'
  if (!targetStudentIds.includes(studentId)) return 'not-targeted'
  return 'allowed'
}

export interface DashboardSubmission {
  studentId: string
  submittedAt: string | Date
}

export interface DashboardSummary {
  expected: number
  submitted: number
  missing: number
  late: number
  missingStudentIds: string[]
  missingMentionText: string
}

export function calculateDashboard(
  targets: readonly AudienceStudent[],
  submissions: readonly DashboardSubmission[],
  dueAt: string | Date | null,
): DashboardSummary {
  const latestByStudent = new Map<string, Date>()
  for (const submission of submissions) {
    const submittedAt = new Date(submission.submittedAt)
    const current = latestByStudent.get(submission.studentId)
    if (!current || submittedAt.getTime() > current.getTime()) {
      latestByStudent.set(submission.studentId, submittedAt)
    }
  }

  const deadline = dueAt ? new Date(dueAt).getTime() : null
  const missingStudents: AudienceStudent[] = []
  let late = 0

  for (const student of targets) {
    const submittedAt = latestByStudent.get(student.id)
    if (!submittedAt) {
      missingStudents.push(student)
    } else if (deadline !== null && submittedAt.getTime() > deadline) {
      late += 1
    }
  }

  const submitted = targets.length - missingStudents.length
  const missingNames = [...new Set(missingStudents.map((student) => student.name.trim()).filter(Boolean))]

  return {
    expected: targets.length,
    submitted,
    missing: missingStudents.length,
    late,
    missingStudentIds: missingStudents.map((student) => student.id),
    missingMentionText: missingNames.map((name) => `@${name}`).join(' '),
  }
}
