export interface ApiErrorDetail {
  field?: string
  reason: string
}

export class ApiRequestError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

const API_PREFIX = `${import.meta.env.VITE_API_BASE ?? ''}/api/v1`
const ADMIN_TOKEN_KEY = 'hcs.teacher-key'

export function setAdminToken(token: string): void {
  if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY)
}

export function getAdminToken(): string {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? ''
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getAdminToken()
  if (token) headers.set('X-Demo-Admin-Token', token)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_PREFIX}${path}`, { ...init, headers })
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok) {
    const payload = contentType.includes('application/json') ? await response.json() : null
    throw new ApiRequestError(payload?.message ?? `Request failed (${response.status}).`, payload?.code ?? 'REQUEST_FAILED', response.status)
  }
  if (contentType.includes('application/json')) return (await response.json()).data as T
  return await response.blob() as T
}

async function triggerFileDownload(response: Response, fallbackName: string): Promise<void> {
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  const encodedName = response.headers.get('Content-Disposition')?.split("filename*=UTF-8''")[1]
  anchor.download = encodedName ? decodeURIComponent(encodedName) : fallbackName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

export const api = {
  request,
  currentClass: () => request<{ classId: string; name: string; studentCount: number } | null>('/classes/current'),
  bootstrap: (className: string) => request<{ id: string; name: string }>('/demo/bootstrap', { method: 'POST', body: JSON.stringify({ className }) }),
  listStudents: async (classId: string) => {
    const items: Array<{ id: string; studentNo: string; name: string; groups: Array<{ id: string; name: string }> }> = []
    let page = 1
    let total = 0
    do {
      const result = await request<{ items: typeof items; total: number }>(`/classes/${encodeURIComponent(classId)}/students?page=${page}&pageSize=100`)
      items.push(...result.items)
      total = result.total
      page += 1
    } while (items.length < total)
    return { items, total }
  },
  importStudents: (classId: string, students: Array<{ studentNo: string; name: string }>) => request<{ created: number; updated: number; rejected: Array<{ row: number; reason: string }> }>(`/classes/${encodeURIComponent(classId)}/students`, { method: 'PUT', body: JSON.stringify({ students }) }),
  listGroups: (classId: string) => request<Array<{ id: string; name: string; memberCount: number }>>(`/classes/${encodeURIComponent(classId)}/groups`),
  createGroups: (classId: string, payload: { name: string; strategy?: 'manual' | 'balanced_random'; studentIds?: string[]; groupCount?: number }) => request<unknown>(`/classes/${encodeURIComponent(classId)}/groups`, { method: 'POST', body: JSON.stringify(payload) }),
  listAssignments: () => request<{ items: AssignmentListItem[]; total: number }>('/assignments?pageSize=100'),
  createAssignment: (payload: unknown) => request<AssignmentListItem>('/assignments', { method: 'POST', body: JSON.stringify(payload) }),
  setAssignmentState: (id: string, state: 'published' | 'closed') => request<unknown>(`/assignments/${encodeURIComponent(id)}/state`, { method: 'PATCH', body: JSON.stringify({ state }) }),
  dashboard: (id: string) => request<AssignmentDashboard>(`/assignments/${encodeURIComponent(id)}/dashboard`),
  feedback: (submissionId: string, payload: { score?: number; feedbackText: string }) => request<unknown>(`/submissions/${encodeURIComponent(submissionId)}/feedback`, { method: 'PATCH', body: JSON.stringify(payload) }),
  setCompletion: (assignmentId: string, studentId: string, completed: boolean) => request<unknown>(`/assignments/${encodeURIComponent(assignmentId)}/completions/${encodeURIComponent(studentId)}`, { method: 'PUT', body: JSON.stringify({ completed }) }),
  getPublicAssignment: (shareCode: string) => request<PublicAssignment>(`/public/assignments/${encodeURIComponent(shareCode)}`),
  submitAssignment: (shareCode: string, payload: { studentNo: string; studentName: string; textContent: string; files: File[] }) => {
    const form = new FormData()
    form.set('studentNo', payload.studentNo)
    form.set('studentName', payload.studentName)
    form.set('textContent', payload.textContent)
    payload.files.forEach((file) => form.append('files', file, file.name))
    return request<{ submissionId: string; receiptCode: string; version: number; submittedAt: string; files: Array<{ id: string }> }>(`/public/assignments/${encodeURIComponent(shareCode)}/submissions`, { method: 'POST', body: form })
  },
  checkIn: (shareCode: string, payload: { studentNo?: string; studentName?: string }) => request<{ displayName: string; checkedInAt: string; alreadyCheckedIn: boolean }>(`/public/assignments/${encodeURIComponent(shareCode)}/check-ins`, { method: 'POST', body: JSON.stringify(payload) }),
  getRelayEntries: (shareCode: string) => request<{ items: Array<{ position: number; displayName: string; content: string }>; total: number }>(`/public/assignments/${encodeURIComponent(shareCode)}/relay-entries`),
  joinRelay: (shareCode: string, payload: { studentNo?: string; studentName?: string; content?: string }) => request<{ position: number }>(`/public/assignments/${encodeURIComponent(shareCode)}/relay-entries`, { method: 'POST', body: JSON.stringify(payload) }),
  receipt: (receiptCode: string) => request<StudentReceipt>(`/public/submissions/${encodeURIComponent(receiptCode)}`),
  downloadSubmissionFile: async (assignmentId: string, submissionId: string, fileId: string) => {
    const token = getAdminToken()
    const query = new URLSearchParams({ fileId })
    const response = await fetch(`${API_PREFIX}/assignments/${encodeURIComponent(assignmentId)}/submissions/${encodeURIComponent(submissionId)}/download?${query}`, {
      headers: token ? { 'X-Demo-Admin-Token': token } : {},
    })
    if (!response.ok) throw new ApiRequestError('附件暂时无法下载。', 'DOWNLOAD_FAILED', response.status)
    await triggerFileDownload(response, '作业附件')
  },
  download: async (fileId: string, receiptCode: string) => {
    const response = await fetch(`${API_PREFIX}/public/files/${encodeURIComponent(fileId)}/download?receiptCode=${encodeURIComponent(receiptCode)}`)
    if (!response.ok) throw new ApiRequestError('文件暂时无法下载。', 'DOWNLOAD_FAILED', response.status)
    await triggerFileDownload(response, '作业附件')
  },
  exportFile: async (assignmentId: string, format: 'csv' | 'zip' | 'docx', submissionId?: string) => {
    const token = getAdminToken()
    const query = new URLSearchParams({ format })
    if (submissionId) query.set('submissionId', submissionId)
    const response = await fetch(`${API_PREFIX}/assignments/${encodeURIComponent(assignmentId)}/exports?${query}`, { headers: token ? { 'X-Demo-Admin-Token': token } : {} })
    if (!response.ok) throw new ApiRequestError('导出失败，请稍后重试。', 'EXPORT_FAILED', response.status)
    await triggerFileDownload(response, `作业.${format}`)
  },
}

export interface AssignmentListItem {
  id: string
  title: string
  type: 'online' | 'offline' | 'checkin' | 'relay'
  state: 'draft' | 'published' | 'closed'
  dueAt: string | null
  expectedCount: number
  submittedCount: number
  missingCount: number
  shareUrl: string
}

export interface AssignmentDashboard {
  assignment: { id: string; title: string; type: AssignmentListItem['type']; state: AssignmentListItem['state']; dueAt: string | null; shareUrl: string }
  summary: { expected: number; submitted: number; missing: number; late: number }
  missingMentionText: string
  items: Array<{
    studentId: string
    studentNo: string
    name: string
    submissionId: string | null
    status: string
    submittedAt: string | null
    textContent: string
    files: Array<{ id: string; originalName: string; sizeBytes: number }>
    score: number | null
    feedbackText: string | null
  }>
}

export interface PublicAssignment {
  id: string
  title: string
  type: AssignmentListItem['type']
  instructions: string
  dueAt: string | null
  submissionMode: 'text' | 'file' | 'both'
  allowedFileTypes: string[]
  maxFileCount: number
  maxFileSizeMB: number
  state: string
}

export interface StudentReceipt {
  assignment: { id: string; title: string; type: AssignmentListItem['type']; dueAt: string | null }
  submittedAt: string
  version: number
  textContent: string
  files: Array<{ id: string; originalName: string; contentType: string; sizeBytes: number }>
  feedback: { score: number | null; feedbackText: string; reviewedAt: string } | null
}
