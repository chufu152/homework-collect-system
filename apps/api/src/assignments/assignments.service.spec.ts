import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { AssignmentsService } from './assignments.service.js'

function serviceForLists(rows: Array<{ id: string; type: string; state: string; dueAt: Date | null; shareCode: string; targets: Array<{ studentId: string }>; submissions: Array<{ studentId: string; submittedAt: Date }>; completions: Array<{ studentId: string }>; checkIns: Array<{ studentId: string }>; relayEntries: Array<{ studentId: string }> }>) {
  const findMany = vi.fn().mockResolvedValue(rows)
  const count = vi.fn().mockResolvedValue(rows.length)
  const transaction = vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  const prisma = { assignment: { findMany, count }, $transaction: transaction }
  const service = new AssignmentsService(prisma as never, {} as never, {} as never)
  return { service, transaction }
}

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
