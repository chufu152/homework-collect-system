import { mkdtemp, mkdir, rm, stat, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StorageService } from './storage.service.js'

let root = ''

afterEach(async () => {
  delete process.env.STORAGE_DRIVER
  delete process.env.UPLOAD_DIR
  delete process.env.STORAGE_FALLBACK_DIR
  if (root) await rm(root, { recursive: true, force: true })
  root = ''
})

function makeFile(buffer: Partial<Express.Multer.File>): Express.Multer.File {
  return { buffer: Buffer.from(''), ...buffer } as Express.Multer.File
}

async function localService(): Promise<StorageService> {
  root = await mkdtemp(join(tmpdir(), 'homework-storage-'))
  process.env.STORAGE_DRIVER = 'local'
  process.env.UPLOAD_DIR = join(root, 'primary')
  process.env.STORAGE_FALLBACK_DIR = join(root, 'fallback')
  return new StorageService()
}

/** 模拟教师电脑关机：把主存储根目录指向一个普通文件，任何 IO 都会失败。 */
async function offlinePrimaryService(): Promise<StorageService> {
  root = await mkdtemp(join(tmpdir(), 'homework-storage-'))
  process.env.STORAGE_DRIVER = 'local'
  const blocker = join(root, 'not-a-directory')
  await writeFile(blocker, 'this path is a file, so io beneath it always fails')
  process.env.UPLOAD_DIR = join(blocker, 'primary')
  process.env.STORAGE_FALLBACK_DIR = join(root, 'fallback')
  return new StorageService()
}

describe('local attachment streaming', () => {
  it('streams stored bytes without loading the whole object into memory', async () => {
    const service = await localService()
    await mkdir(join(root, 'primary', 'assignment', 'student'), { recursive: true })
    await writeFile(join(root, 'primary', 'assignment', 'student', 'answer.pdf'), '%PDF-1.7 streamed')
    const stream = await service.openReadStream('assignment/student/answer.pdf')
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).toString()).toBe('%PDF-1.7 streamed')
  })

  it('rejects traversal keys and missing objects before response headers are written', async () => {
    const service = await localService()
    await expect(service.openReadStream('../outside.pdf')).rejects.toThrow('Invalid internal storage key.')
    await expect(service.openReadStream('assignment/student/missing.pdf')).rejects.toThrow()
  })

  it('does not issue presigned direct links for the local driver', async () => {
    const service = await localService()
    expect(service.presignedDownloadUrl('assignment/student/answer.pdf', 'answer.pdf')).toBeNull()
  })
})

describe('dynamic storage failover', () => {
  it('stashes new uploads on the server when the teacher-PC mount is offline', async () => {
    const service = await offlinePrimaryService()
    const file = makeFile({ buffer: Buffer.from('offline upload'), originalname: 'a.png' })

    await service.save('assign1/stu1/blob-a.png', file)

    expect(service.isPrimaryHealthy()).toBe(false)
    // 暂存目录里有完整内容，下载端点走 fallback 也能读出来。
    const stashed = await readFile(join(root, 'fallback', 'assign1', 'stu1', 'blob-a.png'))
    expect(stashed.toString()).toBe('offline upload')
    const stream = await service.openReadStream('assign1/stu1/blob-a.png')
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).toString()).toBe('offline upload')
  })

  it('writes straight to the primary disk and keeps the fallback empty when healthy', async () => {
    const service = await localService()
    const file = makeFile({ buffer: Buffer.from('online upload'), originalname: 'a.png' })

    await service.save('assign1/stu1/blob-b.png', file)

    expect(service.isPrimaryHealthy()).toBe(true)
    await expect(readFile(join(root, 'primary', 'assign1', 'stu1', 'blob-b.png'))).resolves.toEqual(Buffer.from('online upload'))
    await expect(stat(join(root, 'fallback'))).rejects.toThrow()
  })

  it('serves fallback content through read() when the primary copy is missing', async () => {
    const service = await localService()
    // 手工放一份「只在服务器暂存」的文件：电脑关机期间提交、还没被巡检搬走的场景。
    const fallbackDir = join(root, 'fallback', 'assign1', 'stu1')
    await mkdir(fallbackDir, { recursive: true })
    await writeFile(join(fallbackDir, 'blob-c.png'), 'still on server')

    await expect(service.read('assign1/stu1/blob-c.png')).resolves.toEqual(Buffer.from('still on server'))
    await expect(service.read('assign1/stu1/blob-missing.png')).rejects.toThrow()
  })

  it('moves stashed files back to the primary disk once the teacher PC is online again', async () => {
    // 第一步：主盘离线时落一份暂存。
    const offline = await offlinePrimaryService()
    const file = makeFile({ buffer: Buffer.from('queued for sync'), originalname: 'a.png' })
    await offline.save('assign1/stu1/blob-d.png', file)
    const fallbackFile = join(root, 'fallback', 'assign1', 'stu1', 'blob-d.png')
    await expect(readFile(fallbackFile)).resolves.toBeDefined()

    // 第二步：电脑恢复在线（换一个可用的主盘根目录），触发回收巡检。
    delete process.env.UPLOAD_DIR
    process.env.UPLOAD_DIR = join(root, 'primary')
    await mkdir(join(root, 'primary'), { recursive: true })
    const recovered = new StorageService()
    const moved = await recovered.syncFallbackToPrimary()

    expect(moved).toBe(1)
    await expect(readFile(join(root, 'primary', 'assign1', 'stu1', 'blob-d.png'))).resolves.toEqual(Buffer.from('queued for sync'))
    await expect(readFile(fallbackFile)).rejects.toThrow()
  })

  it('does not duplicate files that already reached the primary disk after a partial sync', async () => {
    const service = await localService()
    process.env.STORAGE_FALLBACK_DIR = join(root, 'fallback')
    const fallbackDir = join(root, 'fallback', 'assign1', 'stu1')
    await mkdir(fallbackDir, { recursive: true })
    await mkdir(join(root, 'primary', 'assign1', 'stu1'), { recursive: true })
    await writeFile(join(fallbackDir, 'blob-e.png'), 'stale copy')
    await writeFile(join(root, 'primary', 'assign1', 'stu1', 'blob-e.png'), 'already synced')

    const moved = await service.syncFallbackToPrimary()

    expect(moved).toBe(1)
    await expect(readFile(join(root, 'primary', 'assign1', 'stu1', 'blob-e.png'))).resolves.toEqual(Buffer.from('already synced'))
    await expect(readFile(join(fallbackDir, 'blob-e.png'))).rejects.toThrow()
  })

  it('refuses a fallback directory that is the same as the primary root', async () => {
    root = await mkdtemp(join(tmpdir(), 'homework-storage-'))
    process.env.STORAGE_DRIVER = 'local'
    process.env.UPLOAD_DIR = root
    process.env.STORAGE_FALLBACK_DIR = root
    expect(() => new StorageService()).toThrow('STORAGE_FALLBACK_DIR must differ from UPLOAD_DIR.')
  })
})
