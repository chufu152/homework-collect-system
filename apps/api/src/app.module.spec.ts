import { describe, expect, it, vi } from 'vitest'
import { ClassesService } from './classes/classes.service.js'

function prismaStub(existing: { id: string } | null, transactionError?: Error) {
  const transaction = {
    classroom: {
      create: vi.fn().mockResolvedValue({ id: 'class-1', name: '三年级一班', _count: { students: 0 } }),
    },
    demoState: {
      create: vi.fn().mockResolvedValue({ id: 'demo', classId: 'class-1' }),
    },
  }
  return {
    classroom: { findFirst: vi.fn().mockResolvedValue(existing) },
    demoState: { findUnique: vi.fn().mockResolvedValue(existing ? { id: 'demo', classId: existing.id } : null) },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => {
      if (transactionError) throw transactionError
      return callback(transaction)
    }),
    transaction,
  }
}

describe('demo class initialization', () => {
  it('creates the class and its singleton bootstrap marker atomically', async () => {
    const prisma = prismaStub(null)
    const created = await new ClassesService(prisma as never).bootstrap({ className: ' 三年级一班 ' })
    expect(created.name).toBe('三年级一班')
    expect(prisma.$transaction).toHaveBeenCalledOnce()
    expect(prisma.transaction.demoState.create).toHaveBeenCalledWith({ data: { id: 'demo', classId: 'class-1' } })
  })

  it('refuses a second bootstrap and maps a concurrent singleton race to conflict', async () => {
    const initialized = prismaStub({ id: 'class-1' })
    await expect(new ClassesService(initialized as never).bootstrap({ className: '另一班' }))
      .rejects.toThrow('This demo already has a class.')
    expect(initialized.$transaction).not.toHaveBeenCalled()

    const uniqueError = Object.assign(new Error('unique violation'), { code: 'P2002' })
    const racing = prismaStub(null, uniqueError)
    await expect(new ClassesService(racing as never).bootstrap({ className: '三年级一班' }))
      .rejects.toThrow('This demo already has a class.')
  })
})
