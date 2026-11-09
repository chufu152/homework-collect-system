import 'reflect-metadata'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssignmentsService } from './assignments.service.js'

function serviceForLists(rows: Array<{ id: string; type: string; state: string; dueAt: Date | null; shareCode: string; targets: Array<{ studentId: string }>; submissions: Array<{ studentId: string; submittedAt: Date }>; completions: Array<{ studentId: string }>; checkIns: Array<{ studentId: string }>; relayEntries: Array<{ studentId: string }> }>) {
  const findMany = vi.fn().mockResolvedValue(rows)
  const count = vi.fn().mockResolvedValue(rows.length)
  const transaction = vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  const prisma = { assignment: { findMany, count }, $transaction: transaction }
  const service = new AssignmentsService(prisma as never, {} as never, {} as never)
  return { service, transaction }
}

function fileService() {
  const prisma = {
    submissionFile: {
      findUnique: vi.fn().mockResolvedValue({
        storageKey: 'assignment/student/answer.pdf',
        contentType: 'application/pdf',
        originalName: 'answer.pdf',
        sizeBytes: 3,
        version: { submission: { receiptCode: 'real-receipt-code' } },
      }),
    },
  }
  const storage = { openReadStream: vi.fn().mockResolvedValue('a-stream') }
  return { service: new AssignmentsService(prisma as never, storage as never, {} as never), storage }
}

describe('unguarded file download credentials', () => {
  afterEach(() => {
    delete process.env.DEMO_ADMIN_TOKEN
  })

  it('does not accept an example placeholder as a teacher key', async () => {
    const placeholder = 'replace-with-a-random-secret-at-least-32-characters-long'
    process.env.DEMO_ADMIN_TOKEN = placeholder
    const { service, storage } = fileService()
    await expect(service.getDownload('file-1', undefined, placeholder)).rejects.toThrow('File not found.')
    expect(storage.openReadStream).not.toHaveBeenCalled()
  })

  it('accepts a configured teacher key or the matching receipt code, and streams the object', async () => {
    process.env.DEMO_ADMIN_TOKEN = 'a-private-class-key-with-32-byte-minimum'
    const { service, storage } = fileService()
    expect((await service.getDownload('file-1', undefined, process.env.DEMO_ADMIN_TOKEN)).content).toBe('a-stream')
    expect((await service.getDownload('file-1', 'real-receipt-code')).content).toBe('a-stream')
    expect(storage.openReadStream).toHaveBeenCalledTimes(2)
    await expect(service.getDownload('file-1', 'wrong-receipt')).rejects.toThrow('File not found.')
  })
})

describe('assignment list completion counts', () => {
  it('counts attendance and relay records as completions instead of online submissions', async () => {
    const rows = [
      {
        id: 'checkin-1', type: 'checkin', state: 'published', dueAt: null, shareCode: 'one',
        targets: [{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }], submissions: [],
        completions: [], checkIns: [{ studentId: 's1' }, { studentId: 's2' }], relayEntries: [],
      },
      {
        id: 'relay-1', type: 'relay', state: 'published', dueAt: null, shareCode: 'two',
        targets: [{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }], submissions: [],
        completions: [], checkIns: [], relayEntries: [{ studentId: 's1' }],
      },
    ]
    const { service } = serviceForLists(rows)
    const result = await service.list({})
    expect(result.items.map((item) => [item.submittedCount, item.missingCount])).toEqual([[2, 1], [1, 2]])
  })
})
