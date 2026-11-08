export const ASSIGNMENT_TYPES = ['online', 'offline', 'checkin', 'relay'] as const
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number]

export const ASSIGNMENT_STATES = ['draft', 'published', 'closed'] as const
export type AssignmentState = (typeof ASSIGNMENT_STATES)[number]

export type SubmissionMode = 'text' | 'file' | 'both'

export interface StudentIdentity {
  id: string
  studentNo: string
  name: string
}

export interface AssignmentTarget {
  mode: 'all' | 'groups' | 'students'
  groupIds?: string[]
  studentIds?: string[]
}

export interface ApiSuccess<T> {
  code: 'OK'
  message: string
  data: T
  requestId: string
}

export interface ApiError {
  code: string
  message: string
  details: Array<{ field?: string; reason: string }>
  requestId: string
}

export function isAssignmentType(value: unknown): value is AssignmentType {
  return typeof value === 'string' && ASSIGNMENT_TYPES.some((type) => type === value)
}

export function isAssignmentState(value: unknown): value is AssignmentState {
  return typeof value === 'string' && ASSIGNMENT_STATES.some((state) => state === value)
}

export function uniqueTargetIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

export function formatMissingMentions(names: readonly string[]): string {
  const uniqueNames = new Set<string>()
  for (const name of names) {
    const normalized = name.trim()
    if (normalized) uniqueNames.add(normalized)
  }
  return [...uniqueNames].map((name) => `@${name}`).join(' ')
}
