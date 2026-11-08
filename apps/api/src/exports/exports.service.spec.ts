import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { ExportsService } from './exports.service.js'

function zipNames(bytes: Buffer): string[] {
  const names: string[] = []
  let offset = 0
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = bytes.readUInt16LE(offset + 26)
    const extraLength = bytes.readUInt16LE(offset + 28)
    names.push(bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8'))
    const compressedSize = bytes.readUInt32LE(offset + 18)
    offset += 30 + nameLength + extraLength + compressedSize
  }
  return names
}

describe('submission file export', () => {
  it('exports the latest student files under the requested class folder names', async () => {
    const prisma = {
      assignment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'a1',
          title: '周测',
          submissions: [{
            student: { id: 's1', studentNo: '1001', name: '张三' },
            versions: [{ files: [{ storageKey: 'private/key', originalName: 'answer.pdf', sizeBytes: 9 }] }],
          }],
        }),
      },
    }
    const storage = { read: vi.fn().mockResolvedValue(Buffer.from('pdf bytes')) }
    const exported = await new ExportsService(prisma as never, storage as never).exportSubmissionFiles('a1')
    expect(exported.filename).toBe('周测.zip')
    expect(zipNames(exported.content)).toEqual(['1001-张三-周测/answer.pdf'])
    expect(storage.read).toHaveBeenCalledWith('private/key')
  })

  it('refuses ZIP payloads above the configured memory safety limit before reading files', async () => {
    process.env.MAX_EXPORT_BYTES = '8'
    const prisma = {
      assignment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'a2',
          title: '大型作业',
          submissions: [{
            student: { id: 's1', studentNo: '1001', name: '张三' },
            versions: [{ files: [{ storageKey: 'private/large', originalName: 'large.zip', sizeBytes: 9 }] }],
          }],
        }),
      },
    }
    const storage = { read: vi.fn() }
    await expect(new ExportsService(prisma as never, storage as never).exportSubmissionFiles('a2'))
      .rejects.toThrow('ZIP export exceeds the 0 MB safety limit.')
    expect(storage.read).not.toHaveBeenCalled()
    delete process.env.MAX_EXPORT_BYTES
  })
})
