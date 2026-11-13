import path from 'node:path'
import type { StorageService } from '../storage/storage.service.js'

/**
 * 表单作业的文本文件存储层：
 * - 字段配置以 JSON 文本保存（form-config/{assignmentId}.json）；
 * - 收集数据以 TSV 文本保存（form-data/{assignmentId}.tsv），首行表头，
 *   每个学生一行：学号、姓名、各字段值；首次提交追加一行，重复提交原地改写。
 * 文件都经过 StorageService 落盘（教师电脑 + 服务器暂存兜底）。
 */

export type FormFieldType = 'text' | 'number' | 'date'

export interface FormField {
  name: string
  type: FormFieldType
  required: boolean
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
const IDENTITY_NO = '学号'
const IDENTITY_NAME = '姓名'

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
    if (name === IDENTITY_NO || name === IDENTITY_NAME) return `字段名「${name}」是系统保留列名，请换一个。`
    if (seen.has(name)) return `字段名「${name}」重复了。`
    if (!['text', 'number', 'date'].includes(field.type)) return `字段「${name}」的类型不正确。`
    seen.add(name)
    field.name = name
    field.required = field.required === true
  }
  if (!seen.has(config.primaryKey)) return '主键必须从表单字段中选择。'
  if (config.sortField && !seen.has(config.sortField)) return '排序依据必须从表单字段中选择。'
  config.sortDir = config.sortDir === 'desc' ? 'desc' : 'asc'
  return null
}

/** 校验一份提交值；返回错误文案或 null。 */
export function validateFormValues(config: FormConfig, rawValues: unknown): Record<string, string> | string {
  if (typeof rawValues !== 'object' || rawValues === null || Array.isArray(rawValues)) return '表单数据格式不正确。'
  const values: Record<string, string> = {}
  const input = rawValues as Record<string, unknown>
  for (const field of config.fields) {
    const raw = input[field.name]
    if (raw !== undefined && typeof raw !== 'string') return `字段「${field.name}」的填写格式不正确。`
    const value = sanitizeCell(typeof raw === 'string' ? raw : '')
    if (field.required && !value) return `请填写「${field.name}」。`
    if (value.length > MAX_VALUE_LENGTH) return `「${field.name}」的内容不能超过 ${MAX_VALUE_LENGTH} 字。`
    if (value) {
      if (field.type === 'number' && !/^-?\d+(\.\d+)?$/.test(value)) return `「${field.name}」需要填写数字。`
      if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `「${field.name}」需要按 日期（年-月-日）格式填写。`
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

function headerFor(config: FormConfig): string[] {
  return [IDENTITY_NO, IDENTITY_NAME, ...config.fields.map((field) => field.name)]
}

function recordLine(config: FormConfig, record: FormRecord): string {
  const cells = [sanitizeCell(record.studentNo), sanitizeCell(record.name), ...config.fields.map((field) => sanitizeCell(record.values[field.name] ?? ''))]
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
  const records: FormRecord[] = []
  // 第一行是表头；数据行按配置的字段顺序取值，短行按空值补齐。
  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const values: Record<string, string> = {}
    config.fields.forEach((field, index) => {
      values[field.name] = cells[index + 2] ?? ''
    })
    records.push({ studentNo: cells[0] ?? '', name: cells[1] ?? '', values })
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

/** 按配置的排序依据整理记录顺序（用于展示与导出）。 */
export function sortFormRecords(config: FormConfig, records: FormRecord[]): FormRecord[] {
  if (!config.sortField) return records
  const dir = config.sortDir === 'desc' ? -1 : 1
  const field = config.fields.find((item) => item.name === config.sortField)
  return [...records].sort((left, right) => {
    const a = left.values[config.sortField!] ?? ''
    const b = right.values[config.sortField!] ?? ''
    if (field?.type === 'number') return (Number(a) - Number(b)) * dir
    return a.localeCompare(b, 'zh-CN') * dir
  })
}
