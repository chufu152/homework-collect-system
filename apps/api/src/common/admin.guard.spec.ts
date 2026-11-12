import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminGuard } from './admin.guard.js'
import { hashTeacherKey } from './admin-token.js'

const CLASS_KEY = 'a-private-class-key-with-32-byte-minimum'

function prismaStub(options: { classroom?: { teacherKeyHash: string } | null } = {}) {
  return {
    classroom: { findUnique: vi.fn().mockResolvedValue(options.classroom === undefined ? null : options.classroom) },
    assignment: { findUnique: vi.fn().mockResolvedValue(null) },
    submission: { findUnique: vi.fn().mockResolvedValue(null) },
  }
}

function executionContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never
}

function classRequest(token: string | undefined, classId = 'class-1') {
  return {
    header: (name: string) => name.toLowerCase() === 'x-demo-admin-token' ? token : undefined,
    params: { classId } as Record<string, unknown>,
    query: {} as Record<string, unknown>,
    body: {} as Record<string, unknown>,
  }
}

afterEach(() => {
  delete process.env.DEMO_ADMIN_TOKEN
})

describe('per-class teacher key guard', () => {
  it('rejects missing, short, and placeholder keys before touching the database', async () => {
    const prisma = prismaStub()
    const guard = new AdminGuard(prisma as never)
    await expect(guard.canActivate(executionContext(classRequest(undefined)))).rejects.toThrow('A valid teacher key is required.')
    await expect(guard.canActivate(executionContext(classRequest('short')))).rejects.toThrow('A valid teacher key is required.')
    await expect(guard.canActivate(executionContext(classRequest('replace-with-a-long-random-secret')))).rejects.toThrow('A valid teacher key is required.')
    expect(prisma.classroom.findUnique).not.toHaveBeenCalled()
  })

  it('reports a missing class distinctly', async () => {
    const guard = new AdminGuard(prismaStub() as never)
    await expect(guard.canActivate(executionContext(classRequest(CLASS_KEY))))
      .rejects.toThrow('Class not found.')
  })

  it('accepts the class key and rejects a wrong key for a class that owns a hash', async () => {
    const prisma = prismaStub({ classroom: { teacherKeyHash: hashTeacherKey(CLASS_KEY) } })
    const guard = new AdminGuard(prisma as never)
    await expect(guard.canActivate(executionContext(classRequest('wrong-key-but-long-enough'))))
      .rejects.toThrow('A valid teacher key is required.')
    await expect(guard.canActivate(executionContext(classRequest(CLASS_KEY)))).resolves.toBe(true)
  })

  it('falls back to the deployment token for legacy classes without a key hash', async () => {
    const guard = new AdminGuard(prismaStub({ classroom: { teacherKeyHash: '' } }) as never)

    process.env.DEMO_ADMIN_TOKEN = CLASS_KEY
    await expect(guard.canActivate(executionContext(classRequest(CLASS_KEY)))).resolves.toBe(true)
    await expect(guard.canActivate(executionContext(classRequest('wrong-key-but-long-enough'))))
      .rejects.toThrow('A valid teacher key is required.')

    delete process.env.DEMO_ADMIN_TOKEN
    await expect(guard.canActivate(executionContext(classRequest(CLASS_KEY))))
      .rejects.toThrow('predates per-class keys')
  })

  it('resolves the class from body.classId when the route has no id parameter', async () => {
    const prisma = prismaStub({ classroom: { teacherKeyHash: hashTeacherKey(CLASS_KEY) } })
    const guard = new AdminGuard(prisma as never)
    const request = classRequest(CLASS_KEY)
    request.params = {}
    request.body = { classId: 'class-1' }
    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true)
    expect(prisma.classroom.findUnique).toHaveBeenCalledWith({ where: { id: 'class-1' }, select: { teacherKeyHash: true } })
  })
})
