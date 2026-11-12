import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StorageService } from './storage.service.js'

let root = ''

afterEach(async () => {
  delete process.env.STORAGE_DRIVER
  delete process.env.UPLOAD_DIR
  if (root) await rm(root, { recursive: true, force: true })
  root = ''
})

async function localService(): Promise<StorageService> {
  root = await mkdtemp(join(tmpdir(), 'homework-storage-'))
  process.env.STORAGE_DRIVER = 'local'
  process.env.UPLOAD_DIR = root
  return new StorageService()
}

describe('local attachment streaming', () => {
  it('streams stored bytes without loading the whole object into memory', async () => {
    const service = await localService()
    await mkdir(join(root, 'assignment', 'student'), { recursive: true })
    await writeFile(join(root, 'assignment', 'student', 'answer.pdf'), '%PDF-1.7 streamed')
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
