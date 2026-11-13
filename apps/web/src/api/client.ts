export interface ApiErrorDetail {
  field?: string
  reason: string
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    /** 429 响应 `Retry-After` 的秒数；无该头时为 null。 */
    public readonly retryAfter: number | null = null,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

const API_PREFIX = `${import.meta.env.VITE_API_BASE ?? ''}/api/v1`

/**
 * 多班级管理：每个班级持有独立密钥，导入过的班级持久保存在 localStorage，
 * 会话/页面之间可随时切换；请求头自动携带「当前活动班级」的密钥。
 */
export interface ImportedClass {
  classId: string
  name: string
  teacherKey: string
  studentCount?: number
}

const IMPORTED_CLASSES_KEY = 'hcs.imported-classes'
const ACTIVE_CLASS_KEY = 'hcs.active-class'

export function listImportedClasses(): ImportedClass[] {
  try {
    const raw = localStorage.getItem(IMPORTED_CLASSES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is ImportedClass => {
      const record = entry as Record<string, unknown>
      return typeof record?.classId === 'string' && typeof record?.name === 'string' && typeof record?.teacherKey === 'string'
    })
  } catch {
    return []
  }
}

function saveImportedClasses(entries: ImportedClass[]): void {
  localStorage.setItem(IMPORTED_CLASSES_KEY, JSON.stringify(entries))
}

export function addImportedClass(entry: ImportedClass): void {
  const entries = listImportedClasses().filter((item) => item.classId !== entry.classId)
  entries.push(entry)
  saveImportedClasses(entries)
  setActiveClassId(entry.classId)
}

export function removeImportedClass(classId: string): void {
  saveImportedClasses(listImportedClasses().filter((item) => item.classId !== classId))
  if (getActiveClassId() === classId) {
    const remaining = listImportedClasses()
    localStorage.setItem(ACTIVE_CLASS_KEY, remaining[0]?.classId ?? '')
  }
}

export function getActiveClassId(): string {
  return localStorage.getItem(ACTIVE_CLASS_KEY) ?? ''
}

export function setActiveClassId(classId: string): void {
  if (classId) localStorage.setItem(ACTIVE_CLASS_KEY, classId)
  else localStorage.removeItem(ACTIVE_CLASS_KEY)
}

export function getActiveClass(): ImportedClass | null {
  return listImportedClasses().find((item) => item.classId === getActiveClassId()) ?? null
}

/** 请求头密钥 = 当前活动班级的班级密钥；未导入任何班级时不携带。 */
export function getAdminToken(): string {
  return getActiveClass()?.teacherKey ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidResponse(message: string): ApiRequestError {
  return new ApiRequestError(message, 'INVALID_RESPONSE', 200)
}

/**
 * C3：JSON 与二进制端点的错误响应共用同一信封解析。
 * 只接受字符串类型的 `code` / `message`，避免信封字段类型异常破坏错误对象契约。
 */
function parseErrorBody(raw: string, contentType: string): { code?: string; message?: string } | null {
  if (!contentType.includes('application/json') || !raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    return {
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
    }
  } catch {
    return null
  }
}

function retryAfterFrom(response: Response): number | null {
  const parsed = Number.parseInt(response.headers.get('Retry-After') ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
}

function readListPage<T>(value: unknown, expectedPage: number): { items: T[]; total: number; page: number; pageSize: number } {
  if (!isRecord(value)
    || !Array.isArray(value.items)
    || !Number.isSafeInteger(value.total)
    || (value.total as number) < 0
    || value.page !== expectedPage
    || !Number.isSafeInteger(value.pageSize)
    || (value.pageSize as number) < 1
    || value.items.length > (value.pageSize as number)) {
    throw invalidResponse('服务返回的列表数据不完整，请重新读取。')
  }
  return value as { items: T[]; total: number; page: number; pageSize: number }
}

/**
 * C1：成功响应的 JSON 信封必须确实带 `data` 字段。
 * `data: null` 是合法的「空结果」，而空响应体 / 非信封 JSON 不是；两者不能混为一谈，
 * 否则调用方会把一个真值（对象或空 Blob）误判成「班级已存在」。
 */
async function readEnvelope<T>(response: Response): Promise<T> {
  const raw = await response.text()
  let envelope: unknown = null
  try {
    envelope = raw ? JSON.parse(raw) : null
  } catch {
    envelope = null
  }
  if (!envelope || typeof envelope !== 'object' || !Object.prototype.hasOwnProperty.call(envelope, 'data')) {
    throw new ApiRequestError(
      '服务返回的内容不是可识别的数据，请稍后重试；若一直如此，请联系教师检查运行环境。',
      'INVALID_ENVELOPE',
      response.status,
    )
  }
  return (envelope as { data: T }).data
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getAdminToken()
  if (token) headers.set('X-Demo-Admin-Token', token)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_PREFIX}${path}`, { ...init, headers })
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok) {
    // C1：错误信封解析失败也要保留 HTTP 状态与兜底 code，不吞掉错误码。
    const raw = await response.text().catch(() => '')
    const payload = parseErrorBody(raw, contentType)
    throw new ApiRequestError(
      payload?.message ?? `Request failed (${response.status}).`,
      payload?.code ?? 'REQUEST_FAILED',
      response.status,
      retryAfterFrom(response),
    )
  }
  if (contentType.includes('application/json')) return readEnvelope<T>(response)
  // C1：成功的非 JSON 响应只可能是二进制流；空 Blob 不是有效数据。
  const blob = await response.blob()
  if (blob.size === 0) {
    throw new ApiRequestError('服务没有返回文件内容，请稍后重试；若一直如此，请联系教师。', 'EMPTY_RESPONSE', response.status)
  }
  return blob as T
}

/**
 * C3：下载 / 导出是二进制端点，但失败时服务端仍返回 JSON 错误信封。
 * 解析信封以保留 `code` / `message` / `Retry-After`（如 429 / 413 / 503），
 * 供 B2 的差异化文案映射；信封缺失或不可解析时退回原有的兜底 code 与中文文案。
 */
async function downloadFailure(response: Response, fallbackCode: string, fallbackMessage: string): Promise<never> {
  const raw = await response.text().catch(() => '')
  const payload = parseErrorBody(raw, response.headers.get('content-type') ?? '')
  throw new ApiRequestError(
    payload?.message ?? fallbackMessage,
    payload?.code ?? fallbackCode,
    response.status,
    retryAfterFrom(response),
  )
}

async function triggerFileDownload(response: Response, fallbackName: string): Promise<void> {
  const blob = await response.blob()
  if (blob.size === 0) {
    throw new ApiRequestError('文件内容为空，请稍后重试；若一直如此，请联系教师。', 'EMPTY_FILE', response.status)
  }
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  const encodedName = response.headers.get('Content-Disposition')?.split("filename*=UTF-8''")[1]
  anchor.download = encodedName ? decodeURIComponent(encodedName) : fallbackName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

/**
 * 下载响应二选一：S3/R2 驱动返回 JSON 信封 `{ redirectUrl }`（预签名直链，
 * 直接跳转对象存储下载，不经服务器中转）；local 驱动仍是二进制流，走原逻辑。
 */
async function consumeDownload(response: Response, fallbackName: string): Promise<void> {
  if (!response.ok) await downloadFailure(response, 'DOWNLOAD_FAILED', '文件暂时无法下载，请稍后重试；若持续失败，请联系教师。')
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const raw = await response.text()
    const payload = parseErrorBody(raw, contentType)
    const redirectUrl = payload && typeof (payload as { redirectUrl?: unknown }).redirectUrl === 'string'
      ? (payload as { redirectUrl: string }).redirectUrl
      : null
    if (!redirectUrl) throw new ApiRequestError('服务没有返回可用的下载地址，请稍后重试。', 'EMPTY_FILE', response.status)
    const anchor = document.createElement('a')
    anchor.href = redirectUrl
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return
  }
  await triggerFileDownload(response, fallbackName)
}

export const api = {
  request,
  /** 导入班级：新班级名 + 新密钥 = 建班；已有班级名 + 匹配密钥 = 幂等导入。 */
  importClass: (className: string, teacherKey: string) => request<{ classId: string; name: string; studentCount: number }>('/classes/import', { method: 'POST', body: JSON.stringify({ className, teacherKey }) }),
  /** 用密钥换取班级信息（密钥与班级一一对应）。 */
  verifyClassKey: (teacherKey: string) => request<{ classId: string; name: string; studentCount: number }>('/classes/verify', { method: 'POST', body: JSON.stringify({ teacherKey }) }),
  listStudents: async (classId: string) => {
    const items: Array<{ id: string; studentNo: string; name: string; groups: Array<{ id: string; name: string }> }> = []
    let page = 1
    let total = 0
    do {
      const raw = await request<unknown>(`/classes/${encodeURIComponent(classId)}/students?page=${page}&pageSize=100`)
      const result = readListPage<typeof items[number]>(raw, page)
      const knownIds = new Set(items.map((student) => student.id))
      for (const student of result.items) {
        if (!isRecord(student) || typeof student.id !== 'string' || knownIds.has(student.id)) {
          throw invalidResponse('学生名单分页包含重复或无效记录，请重新读取。')
        }
        knownIds.add(student.id)
      }
      const previousLength = items.length
      items.push(...result.items)
      total = result.total
      if (items.length > total) throw invalidResponse('学生名单分页总数与记录数不一致，请重新读取。')
      if (items.length === previousLength && items.length < total) {
        throw invalidResponse('学生名单分页读取未能继续，请重新读取。')
      }
      page += 1
    } while (items.length < total)
    return { items, total }
  },
  importStudents: (classId: string, students: Array<{ studentNo: string; name: string }>) => request<{ created: number; updated: number; rejected: Array<{ row: number; reason: string }> }>(`/classes/${encodeURIComponent(classId)}/students`, { method: 'PUT', body: JSON.stringify({ students }) }),
  deleteStudent: (classId: string, studentId: string) => request<{ removed: boolean }>(`/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' }),
  /** 单独修改一名学生的学号/姓名（至少提供一个字段）。 */
  updateStudent: (classId: string, studentId: string, data: { studentNo?: string; name?: string }) => request<{ id: string; studentNo: string; name: string }>(`/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  /** 从云端彻底删除班级：名单、分组、作业与提交记录全部清除，不可恢复。 */
  deleteClass: (classId: string) => request<{ removed: boolean; removedFiles: number }>(`/classes/${encodeURIComponent(classId)}`, { method: 'DELETE' }),
  /** 彻底删除一项作业：提交记录、回执与附件文件一并清除，不可恢复。 */
  deleteAssignment: (assignmentId: string) => request<{ removed: boolean; removedFiles: number }>(`/assignments/${encodeURIComponent(assignmentId)}`, { method: 'DELETE' }),
  listGroups: async (classId: string) => {
    const result = await request<unknown>(`/classes/${encodeURIComponent(classId)}/groups`)
    if (!Array.isArray(result)) throw invalidResponse('服务返回的分组列表格式不正确，请重新读取。')
    return result as Array<{ id: string; name: string; memberCount: number }>
  },
  createGroups: (classId: string, payload: { name: string; strategy?: 'manual' | 'balanced_random'; studentIds?: string[]; groupCount?: number }) => request<unknown>(`/classes/${encodeURIComponent(classId)}/groups`, { method: 'POST', body: JSON.stringify(payload) }),
  listAssignments: async (classId: string) => {
    const raw = await request<unknown>(`/assignments?classId=${encodeURIComponent(classId)}&pageSize=100`)
    const result = readListPage<AssignmentListItem>(raw, 1)
    return { items: result.items, total: result.total }
  },
  createAssignment: (payload: unknown) => request<AssignmentListItem>('/assignments', { method: 'POST', body: JSON.stringify(payload) }),
  setAssignmentState: (id: string, state: 'published' | 'closed') => request<unknown>(`/assignments/${encodeURIComponent(id)}/state`, { method: 'PATCH', body: JSON.stringify({ state }) }),
  dashboard: async (id: string) => {
    const result = await request<unknown>(`/assignments/${encodeURIComponent(id)}/dashboard`)
    // C1：先逐级收窄，避免在同一表达式里对嵌套属性重复做类型收窄。
    const record = isRecord(result) ? result : null
    const summary = record && isRecord(record.summary) ? record.summary : null
    if (!record
      || !isRecord(record.assignment)
      || !summary
      || !Array.isArray(record.items)
      || !['expected', 'submitted', 'missing', 'late'].every((key) => Number.isFinite(summary[key]))) {
      throw invalidResponse('服务返回的看板数据不完整，请重新读取。')
    }
    return result as unknown as AssignmentDashboard
  },
  feedback: (submissionId: string, payload: { score?: number; feedbackText: string }) => request<unknown>(`/submissions/${encodeURIComponent(submissionId)}/feedback`, { method: 'PATCH', body: JSON.stringify(payload) }),
  setCompletion: (assignmentId: string, studentId: string, completed: boolean) => request<unknown>(`/assignments/${encodeURIComponent(assignmentId)}/completions/${encodeURIComponent(studentId)}`, { method: 'PUT', body: JSON.stringify({ completed }) }),
  getPublicAssignment: (shareCode: string) => request<PublicAssignment>(`/public/assignments/${encodeURIComponent(shareCode)}`),
  submitAssignment: (shareCode: string, payload: { studentNo?: string; studentName: string; textContent: string; files: File[]; fileDates?: string[] }) => {
    const form = new FormData()
    if (payload.studentNo) form.set('studentNo', payload.studentNo)
    form.set('studentName', payload.studentName)
    form.set('textContent', payload.textContent)
    payload.files.forEach((file) => form.append('files', file, file.name))
    if (payload.fileDates?.length) form.set('fileDates', JSON.stringify(payload.fileDates))
    return request<{ submissionId: string; receiptCode: string; version: number; submittedAt: string; files: Array<{ id: string }> }>(`/public/assignments/${encodeURIComponent(shareCode)}/submissions`, { method: 'POST', body: form })
  },
  /** 表单作业：读取自己已提交的记录用于回显。 */
  getFormRecord: (shareCode: string, payload: { studentNo?: string; studentName: string }) => request<{ record: FormRecord | null }>(`/public/assignments/${encodeURIComponent(shareCode)}/form-record`, { method: 'POST', body: JSON.stringify(payload) }),
  /** 表单作业：目标名单，供学号/姓名字段下拉选择。 */
  getFormRoster: async (shareCode: string) => {
    const result = await request<unknown>(`/public/assignments/${encodeURIComponent(shareCode)}/form-roster`)
    if (!isRecord(result) || !Array.isArray(result.roster)) return [] as Array<{ studentNo: string; name: string }>
    return (result.roster as Array<Record<string, unknown>>)
      .filter((row) => typeof row.studentNo === 'string' && typeof row.name === 'string')
      .map((row) => ({ studentNo: row.studentNo as string, name: row.name as string }))
  },
  /** 表单作业：提交/更新自己的表单记录（文件字段走 multipart，file__序号 = 文件字段顺序）。 */
  submitForm: (shareCode: string, payload: { studentNo?: string; studentName: string; values: Record<string, string>; files?: Array<{ fieldIndex: number; file: File }> }) => {
    const form = new FormData()
    if (payload.studentNo) form.set('studentNo', payload.studentNo)
    form.set('studentName', payload.studentName)
    form.set('values', JSON.stringify(payload.values))
    for (const entry of payload.files ?? []) {
      form.append(`file__${entry.fieldIndex}`, entry.file, entry.file.name)
    }
    return request<{ receiptCode: string; version: number; updated: boolean; submittedAt: string }>(`/public/assignments/${encodeURIComponent(shareCode)}/form-submissions`, { method: 'POST', body: form })
  },
  checkIn: (shareCode: string, payload: { studentNo?: string; studentName?: string }) => request<{ displayName: string; checkedInAt: string; alreadyCheckedIn: boolean }>(`/public/assignments/${encodeURIComponent(shareCode)}/check-ins`, { method: 'POST', body: JSON.stringify(payload) }),
  getRelayEntries: async (shareCode: string) => {
    const result = await request<unknown>(`/public/assignments/${encodeURIComponent(shareCode)}/relay-entries`)
    if (!isRecord(result) || !Array.isArray(result.items) || !Number.isSafeInteger(result.total) || (result.total as number) < 0) {
      throw invalidResponse('服务返回的接龙名单格式不正确，请重新读取。')
    }
    return result as { items: Array<{ position: number; displayName: string; content: string }>; total: number }
  },
  joinRelay: (shareCode: string, payload: { studentNo?: string; studentName?: string; content?: string }) => request<{ position: number }>(`/public/assignments/${encodeURIComponent(shareCode)}/relay-entries`, { method: 'POST', body: JSON.stringify(payload) }),
  receipt: (receiptCode: string) => request<StudentReceipt>(`/public/submissions/${encodeURIComponent(receiptCode)}`),
  listSubmissionVersions: (submissionId: string) => request<SubmissionVersionList>(`/submissions/${encodeURIComponent(submissionId)}/versions`),
  downloadSubmissionFile: async (assignmentId: string, submissionId: string, fileId: string) => {
    const token = getAdminToken()
    const query = new URLSearchParams({ fileId })
    const response = await fetch(`${API_PREFIX}/assignments/${encodeURIComponent(assignmentId)}/submissions/${encodeURIComponent(submissionId)}/download?${query}`, {
      headers: token ? { 'X-Demo-Admin-Token': token } : {},
    })
    await consumeDownload(response, '作业附件')
  },
  download: async (fileId: string, receiptCode: string) => {
    const response = await fetch(`${API_PREFIX}/public/files/${encodeURIComponent(fileId)}/download?receiptCode=${encodeURIComponent(receiptCode)}`)
    await consumeDownload(response, '作业附件')
  },
  exportFile: async (assignmentId: string, format: 'csv' | 'zip' | 'docx' | 'xlsx', submissionId?: string) => {
    const token = getAdminToken()
    const query = new URLSearchParams({ format })
    if (submissionId) query.set('submissionId', submissionId)
    const response = await fetch(`${API_PREFIX}/assignments/${encodeURIComponent(assignmentId)}/exports?${query}`, { headers: token ? { 'X-Demo-Admin-Token': token } : {} })
    if (!response.ok) await downloadFailure(response, 'EXPORT_FAILED', '导出暂时失败，请稍后重试；若持续失败，请联系教师。')
    await triggerFileDownload(response, `作业.${format}`)
  },
}

export type FormFieldType = 'studentNo' | 'name' | 'date' | 'number' | 'text' | 'file'

export interface FormFieldConfig {
  name: string
  type: FormFieldType
  required: boolean
  /** 仅 date 类型：长/中/短日期或自定义格式。 */
  dateStyle?: 'long' | 'medium' | 'short' | 'custom'
  /** 仅 number 类型：小数（默认）或整数。 */
  numberKind?: 'decimal' | 'integer'
}

export interface FormConfigPayload {
  fields: FormFieldConfig[]
  primaryKey: string
  sortField: string | null
  sortDir: 'asc' | 'desc'
}

export interface FormRecord {
  studentNo: string
  name: string
  values: Record<string, string>
}

export interface AssignmentListItem {
  id: string
  title: string
  type: 'online' | 'offline' | 'checkin' | 'relay' | 'leave' | 'form'
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
  /** 表单作业专用：字段配置与数据文件里的全部记录。 */
  form?: FormConfigPayload | null
  records?: FormRecord[]
  items: Array<{
    studentId: string
    studentNo: string
    name: string
    submissionId: string | null
    status: string
    submittedAt: string | null
    textContent: string
    files: Array<{ id: string; originalName: string; sizeBytes: number; slipDate?: string | null }>
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
  /** 表单作业专用：字段配置。 */
  form?: FormConfigPayload | null
}

export interface SubmissionVersionFile {
  id: string
  originalName: string
  contentType: string
  sizeBytes: number
  slipDate?: string | null
}

export interface SubmissionVersion {
  version: number
  submittedAt: string
  textContent: string
  files: SubmissionVersionFile[]
}

export interface SubmissionVersionList {
  submissionId: string
  currentVersion: number
  items: SubmissionVersion[]
}

export interface StudentReceipt {
  assignment: { id: string; title: string; type: AssignmentListItem['type']; dueAt: string | null }
  submittedAt: string
  version: number
  textContent: string
  files: Array<{ id: string; originalName: string; contentType: string; sizeBytes: number }>
  feedback: { score: number | null; feedbackText: string; reviewedAt: string } | null
  versions: SubmissionVersion[]
}
