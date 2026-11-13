import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StorageService } from '../storage/storage.service.js'
import {
  assertPrimaryKeyAvailable,
  deleteFormFiles,
  findFormRecord,
  formFileKey,
  loadFormConfig,
  readFormRecords,
  saveFormConfig,
  sortFormRecords,
  upsertFormRecord,
  validateFormConfig,
  validateFormValues,
  type FormConfig,
  type FormRecord,
} from './form-store.js'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'form-store-'))
  process.env.STORAGE_DRIVER = 'local'
  process.env.UPLOAD_DIR = join(root, 'primary')
  process.env.STORAGE_FALLBACK_DIR = join(root, 'fallback')
})

afterEach(async () => {
  delete process.env.STORAGE_DRIVER
  delete process.env.UPLOAD_DIR
  delete process.env.STORAGE_FALLBACK_DIR
  if (root) await rm(root, { recursive: true, force: true })
  root = ''
})

function service(): StorageService {
  return new StorageService()
}

const config: FormConfig = {
  fields: [
    { name: '体温', type: 'number', required: true, numberKind: 'decimal' },
    { name: '日期', type: 'date', required: false, dateStyle: 'medium' },
  ],
  primaryKey: '体温',
  sortField: '体温',
  sortDir: 'asc',
}

const identity = { studentNo: 'S01', name: '张三' }

describe('form config validation', () => {
  it('rejects duplicate, out-of-range, or bad-type field names', () => {
    expect(validateFormConfig({ ...config, fields: [] })).toContain('至少需要一个字段')
    expect(validateFormConfig({ ...config, fields: [{ name: 'A', type: 'text', required: false }, { name: 'A', type: 'text', required: false }], primaryKey: 'A' })).toContain('重复')
    expect(validateFormConfig({ ...config, fields: [{ name: 'A', type: 'text', required: false }], primaryKey: 'B' })).toContain('主键')
    expect(validateFormConfig({ ...config, fields: [{ name: 'A', type: 'text', required: false }], primaryKey: 'A', sortField: 'B' })).toContain('排序')
    expect(validateFormConfig({ ...config, fields: [{ name: 'A', type: 'phone' as never, required: false }], primaryKey: 'A' })).toContain('类型不正确')
  })

  it('allows identity column names as regular fields (no reserved names)', () => {
    const identityConfig: FormConfig = {
      fields: [
        { name: '学号', type: 'studentNo', required: true },
        { name: '姓名', type: 'name', required: true },
      ],
      primaryKey: '学号',
      sortField: null,
      sortDir: 'asc',
    }
    expect(validateFormConfig(identityConfig)).toBeNull()
    expect(await_ok(validateFormConfig(identityConfig))).toBe(true)
  })

  it('normalizes date fields with a default style and strips unknown styles', () => {
    const normalized: FormConfig = {
      fields: [
        { name: '日期', type: 'date', required: false },
        { name: '备注', type: 'text', required: false, dateStyle: 'long' as never },
      ],
      primaryKey: '日期',
      sortField: null,
      sortDir: 'asc',
    }
    expect(validateFormConfig(normalized)).toBeNull()
    expect(normalized.fields[0].dateStyle).toBe('medium')
    expect(normalized.fields[1].dateStyle).toBeUndefined()
  })
})

function await_ok(value: unknown): boolean {
  return value === null
}

describe('form value validation', () => {
  it('validates submitted values against field types and required flags', () => {
    expect(validateFormValues(config, { 体温: '36.5', 日期: '2026-11-13' }, identity)).toBeTypeOf('object')
    expect(validateFormValues(config, {}, identity)).toContain('请填写「体温」')
    expect(validateFormValues(config, { 体温: 'hot', 日期: '' }, identity)).toContain('需要填写数字')
    expect(validateFormValues(config, { 体温: '36.5', 日期: '11/13' }, identity)).toContain('格式')
    expect(validateFormValues(config, 'not-an-object', identity)).toContain('格式不正确')
  })

  it('checks date values against the configured date style', () => {
    const longConfig: FormConfig = { ...config, fields: [{ name: '日期', type: 'date', required: true, dateStyle: 'long' }], primaryKey: '日期' }
    expect(validateFormValues(longConfig, { 日期: '2026年11月13日' }, identity)).toBeTypeOf('object')
    expect(validateFormValues(longConfig, { 日期: '2026-11-13' }, identity)).toContain('格式')
    // 短日期：2026/11/13 格式（年/月/日）。
    const shortConfig: FormConfig = { ...config, fields: [{ name: '日期', type: 'date', required: true, dateStyle: 'short' }], primaryKey: '日期' }
    expect(validateFormValues(shortConfig, { 日期: '2026/11/13' }, identity)).toBeTypeOf('object')
    expect(validateFormValues(shortConfig, { 日期: '2026/7/4' }, identity)).toBeTypeOf('object')
    expect(validateFormValues(shortConfig, { 日期: '11-13' }, identity)).toContain('格式')
    const customConfig: FormConfig = { ...config, fields: [{ name: '日期', type: 'date', required: true, dateStyle: 'custom' }], primaryKey: '日期' }
    expect(validateFormValues(customConfig, { 日期: '十一月中旬' }, identity)).toBeTypeOf('object')
  })

  it('validates number fields by the configured number kind', () => {
    const intConfig: FormConfig = { ...config, fields: [{ name: '人数', type: 'number', required: true, numberKind: 'integer' }], primaryKey: '人数' }
    expect(validateFormValues(intConfig, { 人数: '42' }, identity)).toBeTypeOf('object')
    expect(validateFormValues(intConfig, { 人数: '36.5' }, identity)).toContain('需要填写整数')
    // 缺省 numberKind 视为小数，允许小数点。
    expect(validateFormValues(config, { 体温: '36.5', 日期: '2026-11-13' }, identity)).toBeTypeOf('object')
  })

  it('sorts date records chronologically regardless of zero padding', () => {
    const dateConfig: FormConfig = { ...config, fields: [{ name: '日期', type: 'date', required: true, dateStyle: 'short' }], primaryKey: '日期', sortField: '日期', sortDir: 'asc' }
    const records: FormRecord[] = [
      { studentNo: 'S03', name: '赵六', values: { 日期: '2027/1/1' } },
      { studentNo: 'S01', name: '张三', values: { 日期: '2026/11/13' } },
      { studentNo: 'S02', name: '李四', values: { 日期: '2026/7/4' } },
    ]
    const sorted = sortFormRecords(dateConfig, records)
    expect(sorted.map((row) => row.studentNo)).toEqual(['S02', 'S01', 'S03'])
  })

  it('overrides identity fields with server-side roster values and keeps files', () => {
    const identityConfig: FormConfig = {
      fields: [
        { name: '学号', type: 'studentNo', required: true },
        { name: '姓名', type: 'name', required: true },
        { name: '附件', type: 'file', required: false },
      ],
      primaryKey: '学号',
      sortField: null,
      sortDir: 'asc',
    }
    const values = validateFormValues(
      identityConfig,
      { 学号: '伪造学号', 姓名: '伪造姓名', 附件: '' },
      { studentNo: 'S01', name: '张三' },
      { 附件: '请假证明.jpg' },
    ) as Record<string, string>
    expect(values['学号']).toBe('S01')
    expect(values['姓名']).toBe('张三')
    expect(values['附件']).toBe('请假证明.jpg')
  })

  it('keeps the previous file value when no new file is uploaded', () => {
    const fileConfig: FormConfig = { ...config, fields: [{ name: '附件', type: 'file', required: false }], primaryKey: '体温', sortField: '体温' }
    const values = validateFormValues(fileConfig, { 体温: '36.5', 附件: '' }, identity, {}, { 体温: '', 附件: '旧文件.pdf' }) as Record<string, string>
    expect(values['附件']).toBe('旧文件.pdf')
  })
})

describe('form text file storage', () => {
  it('round-trips the config through a JSON text file', async () => {
    const storage = service()
    await saveFormConfig(storage, 'a1', config)
    expect(await loadFormConfig(storage, 'a1')).toEqual(config)
    expect(await loadFormConfig(storage, 'missing')).toBeNull()
  })

  it('appends the first submission and rewrites the same row on resubmission', async () => {
    const storage = service()
    const first: FormRecord = { studentNo: 'S01', name: '张三', values: { 体温: '36.5', 日期: '2026-11-13' } }
    expect(await upsertFormRecord(storage, 'a1', config, first)).toBe(false)

    const second: FormRecord = { studentNo: 'S02', name: '李四', values: { 体温: '37.2', 日期: '2026-11-14' } }
    expect(await upsertFormRecord(storage, 'a1', config, second)).toBe(false)

    // 张三改体温：仍是一行，值被原地更新。
    const revised: FormRecord = { studentNo: 'S01', name: '张三', values: { 体温: '36.8', 日期: '2026-11-13' } }
    expect(await upsertFormRecord(storage, 'a1', config, revised)).toBe(true)

    const records = await readFormRecords(storage, 'a1', config)
    expect(records).toHaveLength(2)
    expect(records[0].values['体温']).toBe('36.8')
    const found = await findFormRecord(storage, 'a1', config, 'S02')
    expect(found?.name).toBe('李四')
    expect(await findFormRecord(storage, 'a1', config, 'S99')).toBeNull()
  })

  it('keeps the TSV shape intact when values contain tabs or newlines', async () => {
    const storage = service()
    const record: FormRecord = { studentNo: 'S01', name: '张三', values: { 体温: '36.5', 日期: 'a\tb' } }
    await upsertFormRecord(storage, 'a1', config, record)
    const records = await readFormRecords(storage, 'a1', config)
    expect(records).toHaveLength(1)
    expect(records[0].values['日期']).toBe('a b')
  })

  it('rejects a primary key value already taken by another student', async () => {
    const storage = service()
    await upsertFormRecord(storage, 'a1', config, { studentNo: 'S01', name: '张三', values: { 体温: '36.5', 日期: '' } })
    // 本人重复提交：主键值与自己的旧值相同是允许的（会走更新）。
    const same = service()
    await expect(assertPrimaryKeyAvailable(same, 'a1', config, { studentNo: 'S01', name: '张三', values: { 体温: '36.5', 日期: '' } })).resolves.toBeUndefined()
    // 别的学生占用相同主键值 → 冲突。
    await expect(assertPrimaryKeyAvailable(service(), 'a1', config, { studentNo: 'S02', name: '李四', values: { 体温: '36.5', 日期: '' } })).rejects.toThrow('已被')
  })

  it('sorts records by the configured sort field and direction', () => {
    const records: FormRecord[] = [
      { studentNo: 'S03', name: '丙', values: { 体温: '37.0', 日期: '' } },
      { studentNo: 'S01', name: '甲', values: { 体温: '36.5', 日期: '' } },
      { studentNo: 'S02', name: '乙', values: { 体温: '36.8', 日期: '' } },
    ]
    expect(sortFormRecords(config, records).map((row) => row.studentNo)).toEqual(['S01', 'S02', 'S03'])
    expect(sortFormRecords({ ...config, sortDir: 'desc' }, records).map((row) => row.studentNo)).toEqual(['S03', 'S02', 'S01'])
    expect(sortFormRecords({ ...config, sortField: null }, records).map((row) => row.studentNo)).toEqual(['S03', 'S01', 'S02'])
  })

  it('builds deterministic file keys and cleans up form files on delete', async () => {
    const storage = service()
    const key = formFileKey('a1', 'S01', '附件', '证明.jpg')
    expect(key).toBe('form-files/a1/S01/附件-证明.jpg')
    await storage.save(key, { buffer: Buffer.from('x'), originalname: '证明.jpg', mimetype: 'image/jpeg', fieldname: 'file__附件' } as never)
    await deleteFormFiles(storage, 'a1')
    await expect(storage.read(key)).rejects.toThrow()
  })
})
