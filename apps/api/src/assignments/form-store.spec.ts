import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StorageService } from '../storage/storage.service.js'
import {
  assertPrimaryKeyAvailable,
  findFormRecord,
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
    { name: '姓名预留', type: 'text', required: false },
    { name: '体温', type: 'number', required: true },
    { name: '日期', type: 'date', required: false },
  ],
  primaryKey: '体温',
  sortField: '体温',
  sortDir: 'asc',
}

describe('form config validation', () => {
  it('rejects duplicate, reserved, or out-of-range field names', () => {
    expect(validateFormConfig({ ...config, fields: [] })).toContain('至少需要一个字段')
    expect(validateFormConfig({ ...config, fields: [{ name: '学号', type: 'text', required: false }], primaryKey: '学号' })).toContain('保留列名')
    expect(validateFormConfig({ ...config, fields: [{ name: 'A', type: 'text', required: false }, { name: 'A', type: 'text', required: false }], primaryKey: 'A' })).toContain('重复')
    expect(validateFormConfig({ ...config, fields: [{ name: 'A', type: 'text', required: false }], primaryKey: 'B' })).toContain('主键')
    expect(validateFormConfig({ ...config, fields: [{ name: 'A', type: 'text', required: false }], primaryKey: 'A', sortField: 'B' })).toContain('排序')
  })

  it('validates submitted values against field types and required flags', () => {
    expect(validateFormValues(config, { 体温: '36.5', 日期: '2026-11-13', 姓名预留: '' })).toBeTypeOf('object')
    expect(validateFormValues(config, {})).toContain('请填写「体温」')
    expect(validateFormValues(config, { 体温: 'hot', 日期: '' })).toContain('需要填写数字')
    expect(validateFormValues(config, { 体温: '36.5', 日期: '11/13' })).toContain('日期')
    expect(validateFormValues(config, 'not-an-object')).toContain('格式不正确')
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
    const first: FormRecord = { studentNo: 'S01', name: '张三', values: { 姓名预留: '', 体温: '36.5', 日期: '2026-11-13' } }
    expect(await upsertFormRecord(storage, 'a1', config, first)).toBe(false)

    const second: FormRecord = { studentNo: 'S02', name: '李四', values: { 姓名预留: '', 体温: '37.2', 日期: '2026-11-14' } }
    expect(await upsertFormRecord(storage, 'a1', config, second)).toBe(false)

    // 张三改体温：仍是一行，值被原地更新。
    const revised: FormRecord = { studentNo: 'S01', name: '张三', values: { 姓名预留: '', 体温: '36.8', 日期: '2026-11-13' } }
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
    const record: FormRecord = { studentNo: 'S01', name: '张三', values: { 姓名预留: 'a\tb', 体温: '36.5', 日期: '2026-11-13' } }
    await upsertFormRecord(storage, 'a1', config, record)
    const records = await readFormRecords(storage, 'a1', config)
    expect(records).toHaveLength(1)
    expect(records[0].values['姓名预留']).toBe('a b')
  })

  it('rejects a primary key value already taken by another student', async () => {
    const storage = service()
    await upsertFormRecord(storage, 'a1', config, { studentNo: 'S01', name: '张三', values: { 姓名预留: '', 体温: '36.5', 日期: '' } })
    // 本人重复提交：主键值与自己的旧值相同是允许的（会走更新）。
    const same = service()
    await expect(assertPrimaryKeyAvailable(same, 'a1', config, { studentNo: 'S01', name: '张三', values: { 姓名预留: '', 体温: '36.5', 日期: '' } })).resolves.toBeUndefined()
    // 别的学生占用相同主键值 → 冲突。
    await expect(assertPrimaryKeyAvailable(service(), 'a1', config, { studentNo: 'S02', name: '李四', values: { 姓名预留: '', 体温: '36.5', 日期: '' } })).rejects.toThrow('已被')
  })

  it('sorts records by the configured sort field and direction', () => {
    const records: FormRecord[] = [
      { studentNo: 'S03', name: '丙', values: { 姓名预留: '', 体温: '37.0', 日期: '' } },
      { studentNo: 'S01', name: '甲', values: { 姓名预留: '', 体温: '36.5', 日期: '' } },
      { studentNo: 'S02', name: '乙', values: { 姓名预留: '', 体温: '36.8', 日期: '' } },
    ]
    expect(sortFormRecords(config, records).map((row) => row.studentNo)).toEqual(['S01', 'S02', 'S03'])
    expect(sortFormRecords({ ...config, sortDir: 'desc' }, records).map((row) => row.studentNo)).toEqual(['S03', 'S02', 'S01'])
    expect(sortFormRecords({ ...config, sortField: null }, records).map((row) => row.studentNo)).toEqual(['S03', 'S01', 'S02'])
  })
})
