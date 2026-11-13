import path from 'node:path'
import type { StorageService } from '../storage/storage.service.js'

/**
 * 表单作业的文本文件存储层：
 * - 字段配置以 JSON 文本保存（form-config/{assignmentId}.json）；
 * - 收集数据以 TSV 文本保存（form-data/{assignmentId}.tsv），首行表头，
 *   每个学生一行：学号、姓名、各字段值；首次提交追加一行，重复提交原地改写。
 * 文件都经过 StorageService 落盘（教师电脑 + 服务器暂存兜底）。
 */

export type FormFieldType = 'studentNo' | 'name' | 'date' | 'number' | 'text' | 'file'

/** 日期字段的格式：长（2026年11月13日）/ 中（2026-11-13）/ 短（2026/11/13）/ 自定义（自由填写）。 */
export type FormDateStyle = 'long' | 'medium' | 'short' | 'custom'

/** 数字字段的格式：小数（默认，允许小数点）/ 整数（只允许整数）。 */
export type FormNumberKind = 'decimal' | 'integer'

/** 学号字段的格式：完整（默认）/ 后六位 / 后两位。 */
export type FormStudentNoStyle = 'full' | 'last6' | 'last2'

export interface FormField {
  name: string
  type: FormFieldType
  required: boolean
  /** 仅 date 类型使用；缺省视为 medium。 */
  dateStyle?: FormDateStyle
  /** 仅 number 类型使用；缺省视为 decimal。 */
  numberKind?: FormNumberKind
  /** 仅 studentNo 类型使用；缺省视为 full。 */
  studentNoStyle?: FormStudentNoStyle
}

export interface FormConfig {
  fields: FormField[]
  primaryKey: string
  sortField: string | null
  sortDir: 'asc' | 'desc'
}

export interface FormRecord {
  studentNo: string
  name: string
  values: Record<string, string>
}

const MAX_FIELDS = 30
const MAX_VALUE_LENGTH = 500
const MAX_FILE_NAME = 200
const IDENTITY_NO = '学号'
const IDENTITY_NAME = '姓名'
const FIELD_TYPES: readonly FormFieldType[] = ['studentNo', 'name', 'date', 'number', 'text', 'file']
const DATE_STYLES: readonly FormDateStyle[] = ['long', 'medium', 'short', 'custom']
const NUMBER_KINDS: readonly FormNumberKind[] = ['decimal', 'integer']
const STUDENT_NO_STYLES: readonly FormStudentNoStyle[] = ['full', 'last6', 'last2']

/** 按配置格式化学号：完整 / 后六位 / 后两位。 */
export function formatStudentNo(studentNo: string, style?: FormStudentNoStyle): string {
  if (style === 'last6') return studentNo.slice(-6)
  if (style === 'last2') return studentNo.slice(-2)
  return studentNo
}

/** 每个作业一把进程内写锁，避免并发读改写同一个数据文件。 */
const locks = new Map<string, Promise<unknown>>()

async function withLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  const current = previous.then(action, action)
  locks.set(key, current.catch(() => undefined))
  try {
    return await current
  } finally {
    if (locks.get(key) === current) locks.delete(key)
  }
}

/** TSV 单元格净化：制表符/换行会破坏行结构，统一替换为空格。 */
function sanitizeCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ').trim()
}

export function validateFormConfig(config: FormConfig): string | null {
  if (!Array.isArray(config.fields) || !config.fields.length) return '表单至少需要一个字段。'
  if (config.fields.length > MAX_FIELDS) return `表单字段不能超过 ${MAX_FIELDS} 个。`
  const seen = new Set<string>()
  for (const field of config.fields) {
    const name = typeof field.name === 'string' ? field.name.trim() : ''
    if (!name || name.length > 40) return '字段名需为 1-40 个字符。'
    if (seen.has(name)) return `字段名「${name}」重复了。`
    if (!FIELD_TYPES.includes(field.type)) return `字段「${name}」的类型不正确。`
    if (field.type === 'date' && field.dateStyle !== undefined && !DATE_STYLES.includes(field.dateStyle)) {
      return `字段「${name}」的日期格式不正确。`
    }
    if (field.type === 'number' && field.numberKind !== undefined && !NUMBER_KINDS.includes(field.numberKind)) {
      return `字段「${name}」的数字格式不正确。`
    }
    if (field.type === 'studentNo' && field.studentNoStyle !== undefined && !STUDENT_NO_STYLES.includes(field.studentNoStyle)) {
      return `字段「${name}」的学号格式不正确。`
    }
    seen.add(name)
    field.name = name
    field.required = field.required === true
    if (field.type === 'date') field.dateStyle = field.dateStyle ?? 'medium'
    else delete field.dateStyle
    if (field.type === 'number') field.numberKind = field.numberKind ?? 'decimal'
    else delete field.numberKind
    if (field.type === 'studentNo') field.studentNoStyle = field.studentNoStyle ?? 'full'
    else delete field.studentNoStyle
  }
  if (!seen.has(config.primaryKey)) return '主键必须从表单字段中选择。'
  if (config.sortField && !seen.has(config.sortField)) return '排序依据必须从表单字段中选择。'
  config.sortDir = config.sortDir === 'desc' ? 'desc' : 'asc'
  return null
}

/** 日期格式校验：长/中/短有固定格式，自定义只要非空即可。 */
function isValidDateValue(style: FormDateStyle, value: string): boolean {
  if (style === 'long') return /^\d{4}年\d{1,2}月\d{1,2}日$/.test(value)
  if (style === 'medium') return /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (style === 'short') return /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(value)
  return true
}

export const DATE_STYLE_HINT: Record<FormDateStyle, string> = {
  long: '2026年11月13日',
  medium: '2026-11-13',
  short: '2026/11/13',
  custom: '按老师要求的格式',
}

/** 校验一份提交值；返回错误文案或整理后的值映射。
 * 身份列（学号/姓名）以服务端名单为准覆盖；文件列没有新文件时保留原有值。 */
export function validateFormValues(
  config: FormConfig,
  rawValues: unknown,
  identity: { studentNo: string; name: string },
  fileNames: Record<string, string> = {},
  previousValues: Record<string, string> = {},
): Record<string, string> | string {
  if (typeof rawValues !== 'object' || rawValues === null || Array.isArray(rawValues)) return '表单数据格式不正确。'
  const values: Record<string, string> = {}
  const input = rawValues as Record<string, unknown>
  for (const field of config.fields) {
    const raw = input[field.name]
    if (raw !== undefined && typeof raw !== 'string') return `字段「${field.name}」的填写格式不正确。`
    let value = sanitizeCell(typeof raw === 'string' ? raw : '')
    if (field.type === 'studentNo') value = sanitizeCell(formatStudentNo(identity.studentNo, field.studentNoStyle))
    else if (field.type === 'name') value = sanitizeCell(identity.name)
    else if (field.type === 'file') {
      value = sanitizeCell(fileNames[field.name] ?? previousValues[field.name] ?? '')
      if (value.length > MAX_FILE_NAME) value = value.slice(-MAX_FILE_NAME)
    }
    if (field.required && !value) return `请填写「${field.name}」。`
    if (value.length > MAX_VALUE_LENGTH) return `「${field.name}」的内容不能超过 ${MAX_VALUE_LENGTH} 字。`
    if (value) {
      if (field.type === 'number') {
        const numberPattern = field.numberKind === 'integer' ? /^-?\d+$/ : /^-?\d+(\.\d+)?$/
        if (!numberPattern.test(value)) {
          return field.numberKind === 'integer'
            ? `「${field.name}」需要填写整数。`
            : `「${field.name}」需要填写数字。`
        }
      }
      if (field.type === 'date' && !isValidDateValue(field.dateStyle ?? 'medium', value)) {
        return `「${field.name}」需要按 ${DATE_STYLE_HINT[field.dateStyle ?? 'medium']} 格式填写。`
      }
    }
    values[field.name] = value
  }
  return values
}

function configKey(assignmentId: string): string {
  return `form-config/${assignmentId}.json`
}

function dataKey(assignmentId: string): string {
  return `form-data/${assignmentId}.tsv`
}

export function formFilesPrefix(assignmentId: string): string {
  return `form-files/${assignmentId}/`
}

/** 文件字段附件的存储 key（确定性规则：重复提交同名覆盖，无需查旧记录即可删除）。 */
export function formFileKey(assignmentId: string, studentNo: string, fieldName: string, fileName: string): string {
  const safeField = fieldName.replace(/[\\/\s]+/g, '-')
  const safeName = fileName.split('/').pop()?.replace(/\\/g, '_') || 'file'
  return `form-files/${assignmentId}/${sanitizeCell(studentNo) || 'unknown'}/${safeField}-${safeName}`
}

async function writeTextFile(storage: StorageService, key: string, text: string): Promise<void> {
  // save() 用 wx 标志防覆盖，文本文件需要原地重写：先删（主盘+暂存都清）再写。
  await storage.remove(key)
  await storage.save(key, { buffer: Buffer.from(text, 'utf8'), originalname: path.posix.basename(key), mimetype: 'text/plain', fieldname: 'file' } as never)
}

export async function saveFormConfig(storage: StorageService, assignmentId: string, config: FormConfig): Promise<void> {
  await writeTextFile(storage, configKey(assignmentId), JSON.stringify(config, null, 2))
}

export async function deleteFormFiles(storage: StorageService, assignmentId: string): Promise<void> {
  await storage.remove(configKey(assignmentId))
  await storage.remove(dataKey(assignmentId))
  // 文件字段的学生附件：整目录前缀清理（s3 驱动 list 暂不支持，忽略失败）。
  try {
    const keys = await storage.list(formFilesPrefix(assignmentId))
    await Promise.allSettled(keys.map((key) => storage.remove(key)))
  } catch {
    // 略：物理文件残留不影响数据一致性。
  }
}

export async function loadFormConfig(storage: StorageService, assignmentId: string): Promise<FormConfig | null> {
  try {
    const buffer = await storage.read(configKey(assignmentId))
    const parsed = JSON.parse(buffer.toString('utf8')) as FormConfig
    if (validateFormConfig(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** 数据文件列布局：老师配置了学号/姓名类型字段时与系统身份列合并，避免重复列。 */
function layoutFor(config: FormConfig): { columns: string[]; fieldPos: Map<string, number>; noPos: number; namePos: number } {
  const columns: string[] = []
  const fieldPos = new Map<string, number>()
  let noPos = -1
  let namePos = -1
  if (!config.fields.some((field) => field.type === 'studentNo')) {
    noPos = columns.length
    columns.push(IDENTITY_NO)
  }
  if (!config.fields.some((field) => field.type === 'name')) {
    namePos = columns.length
    columns.push(IDENTITY_NAME)
  }
  for (const field of config.fields) {
    fieldPos.set(field.name, columns.length)
    columns.push(field.name)
  }
  return { columns, fieldPos, noPos, namePos }
}

function headerFor(config: FormConfig): string[] {
  return layoutFor(config).columns
}

function recordLine(config: FormConfig, record: FormRecord): string {
  const layout = layoutFor(config)
  const cells = new Array<string>(layout.columns.length).fill('')
  if (layout.noPos >= 0) cells[layout.noPos] = sanitizeCell(record.studentNo)
  if (layout.namePos >= 0) cells[layout.namePos] = sanitizeCell(record.name)
  for (const field of config.fields) cells[layout.fieldPos.get(field.name)!] = sanitizeCell(record.values[field.name] ?? '')
  return cells.join('\t')
}

/** 读取全部记录；文件不存在或损坏时返回空列表。 */
export async function readFormRecords(storage: StorageService, assignmentId: string, config: FormConfig): Promise<FormRecord[]> {
  let text: string
  try {
    text = (await storage.read(dataKey(assignmentId))).toString('utf8')
  } catch {
    return []
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return []
  const layout = layoutFor(config)
  const noField = config.fields.find((field) => field.type === 'studentNo')
  const nameField = config.fields.find((field) => field.type === 'name')
  const records: FormRecord[] = []
  // 第一行是表头；数据行按配置的列布局取值，短行按空值补齐。
  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const values: Record<string, string> = {}
    for (const field of config.fields) {
      values[field.name] = cells[layout.fieldPos.get(field.name)!] ?? ''
    }
    const studentNo = (layout.noPos >= 0 ? cells[layout.noPos] : noField ? cells[layout.fieldPos.get(noField.name)!] : '') ?? ''
    const name = (layout.namePos >= 0 ? cells[layout.namePos] : nameField ? cells[layout.fieldPos.get(nameField.name)!] : '') ?? ''
    records.push({ studentNo, name, values })
  }
  return records
}

export async function findFormRecord(storage: StorageService, assignmentId: string, config: FormConfig, studentNo: string): Promise<FormRecord | null> {
  const records = await readFormRecords(storage, assignmentId, config)
  return records.find((record) => record.studentNo === studentNo) ?? null
}

/** 首次提交追加一行；重复提交按学号找到原有行原地改写。返回是否为更新。 */
export async function upsertFormRecord(storage: StorageService, assignmentId: string, config: FormConfig, record: FormRecord): Promise<boolean> {
  return withLock(assignmentId, async () => {
    const existing = await readFormRecords(storage, assignmentId, config)
    const index = existing.findIndex((row) => row.studentNo === record.studentNo)
    const isUpdate = index >= 0
    if (isUpdate) existing[index] = record
    else existing.push(record)
    const lines = [headerFor(config).join('\t'), ...existing.map((row) => recordLine(config, row))]
    await writeTextFile(storage, dataKey(assignmentId), `${lines.join('\n')}\n`)
    return isUpdate
  })
}

/** 主键唯一性：除本人外不允许其他学号占用相同主键值。 */
export async function assertPrimaryKeyAvailable(
  storage: StorageService,
  assignmentId: string,
  config: FormConfig,
  record: FormRecord,
): Promise<void> {
  const records = await readFormRecords(storage, assignmentId, config)
  const pkValue = record.values[config.primaryKey] ?? ''
  if (!pkValue) return
  const conflict = records.find((row) => row.studentNo !== record.studentNo && (row.values[config.primaryKey] ?? '') === pkValue)
  if (conflict) throw new Error(`主键「${config.primaryKey}」的值「${pkValue}」已被 ${conflict.name} 使用。`)
}

/** 日期值转可比较的数字：按 年*10000+月*100+日 比较（长/中/短格式通用，未补零也对）。 */
function dateComparable(value: string): number {
  const parts = value.split(/\D+/).filter(Boolean).map(Number)
  if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
    return parts[0] * 10000 + parts[1] * 100 + parts[2]
  }
  return 0
}

/** 按配置的排序依据整理记录顺序（用于展示与导出）。 */
export function sortFormRecords(config: FormConfig, records: FormRecord[]): FormRecord[] {
  if (!config.sortField) return records
  const dir = config.sortDir === 'desc' ? -1 : 1
  const field = config.fields.find((item) => item.name === config.sortField)
  return [...records].sort((left, right) => {
    const a = left.values[config.sortField!] ?? ''
    const b = right.values[config.sortField!] ?? ''
    if (field?.type === 'number') return (Number(a) - Number(b)) * dir
    if (field?.type === 'date') return (dateComparable(a) - dateComparable(b)) * dir
    return a.localeCompare(b, 'zh-CN') * dir
  })
}

export type FormDisplayColumn = { key: 'studentNo' | 'name'; label: string } | { key: 'field'; label: string; field: FormField }

/** 展示/导出用列：老师若自己配置了学号/姓名类型字段，与系统身份列合并，避免重复列。 */
export function displayColumns(config: FormConfig): FormDisplayColumn[] {
  const columns: FormDisplayColumn[] = []
  if (!config.fields.some((field) => field.type === 'studentNo')) columns.push({ key: 'studentNo', label: IDENTITY_NO })
  if (!config.fields.some((field) => field.type === 'name')) columns.push({ key: 'name', label: IDENTITY_NAME })
  for (const field of config.fields) columns.push({ key: 'field', label: field.name, field })
  return columns
}

/** 取一行记录在展示列上的单元格值。 */
export function recordCell(column: FormDisplayColumn, record: FormRecord): string {
  if (column.key === 'field') return record.values[column.field.name] ?? ''
  return column.key === 'studentNo' ? record.studentNo : record.name
}