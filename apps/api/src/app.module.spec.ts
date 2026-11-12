import { describe, expect, it, vi } from 'vitest'
import { ClassesService } from './classes/classes.service.js'
import { hashTeacherKey } from './common/admin-token.js'

const KEY = 'class-key-2026'

function prismaStub(options: { byName?: { id: string; name: string; teacherKeyHash: string; _count: { students: number } } | null; byHash?: { id: string; name: string } | null; created?: { id: string; name: string; _count: { students: number } } } = {}) {
  return {
    classroom: {
      findFirst: vi.fn()
        .mockResolvedValueOnce(options.byName ?? null)
        .mockResolvedValueOnce(options.byHash ?? null),
      create: vi.fn().mockResolvedValue(options.created ?? { id: 'class-new', name: 'x', _count: { students: 0 } }),
      update: vi.fn().mockResolvedValue({}),
    },
  }
}

describe('import class with per-class key', () => {
  it('creates a new class and stores only the key hash', async () => {
    const prisma = prismaStub({ created: { id: 'class-new', name: '三年级一班', _count: { students: 0 } } })
    const result = await new ClassesService(prisma as never).importClass({ className: ' 三年级一班 ', teacherKey: ` ${KEY} ` })
    expect(result).toEqual({ classId: 'class-new', name: '三年级一班', studentCount: 0 })
    expect(prisma.classroom.create).toHaveBeenCalledWith({
      data: { name: '三年级一班', teacherKeyHash: hashTeacherKey(KEY) },
      include: { _count: { select: { students: true } } },
    })
  })

  it('re-imports an existing class when the key matches, without recreating it', async () => {
    const prisma = prismaStub({ byName: { id: 'class-1', name: '三年级一班', teacherKeyHash: hashTeacherKey(KEY), _count: { students: 12 } } })
    const result = await new ClassesService(prisma as never).importClass({ className: '三年级一班', teacherKey: KEY })
    expect(result).toEqual({ classId: 'class-1', name: '三年级一班', studentCount: 12 })
    expect(prisma.classroom.create).not.toHaveBeenCalled()
  })

  it('rejects a mismatched key for an existing class', async () => {
    const prisma = prismaStub({ byName: { id: 'class-1', name: '三年级一班', teacherKeyHash: hashTeacherKey(KEY), _count: { students: 12 } } })
    await expect(new ClassesService(prisma as never).importClass({ className: '三年级一班', teacherKey: 'another-key-9' }))
      .rejects.toThrow('该班级已存在，密钥不匹配。')
  })

  it('refuses to reuse one key across two different class names', async () => {
    const prisma = prismaStub({ byHash: { id: 'class-1', name: '三年级一班' } })
    await expect(new ClassesService(prisma as never).importClass({ className: '另一班', teacherKey: KEY }))
      .rejects.toThrow('该密钥已被其他班级使用，请更换密钥。')
  })

  it('lets the first import claim the key of a legacy class without a hash', async () => {
    const prisma = prismaStub({ byName: { id: 'class-1', name: '三年级一班', teacherKeyHash: '', _count: { students: 30 } } })
    const result = await new ClassesService(prisma as never).importClass({ className: '三年级一班', teacherKey: KEY })
    expect(result).toEqual({ classId: 'class-1', name: '三年级一班', studentCount: 30 })
    expect(prisma.classroom.update).toHaveBeenCalledWith({ where: { id: 'class-1' }, data: { teacherKeyHash: hashTeacherKey(KEY) } })
  })

  it('rejects keys shorter than 8 characters', async () => {
    const prisma = prismaStub()
    await expect(new ClassesService(prisma as never).importClass({ className: '三年级一班', teacherKey: 'short' }))
      .rejects.toThrow('班级密钥至少需要 8 个字符。')
  })

  it('verifies a key back to exactly one class', async () => {
    const prisma = {
      classroom: {
        findFirst: vi.fn().mockResolvedValue({ id: 'class-1', name: '三年级一班', _count: { students: 29 } }),
      },
    }
    const result = await new ClassesService(prisma as never).verifyClassKey({ teacherKey: KEY })
    expect(result).toEqual({ classId: 'class-1', name: '三年级一班', studentCount: 29 })
    expect(prisma.classroom.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherKeyHash: hashTeacherKey(KEY) } }),
    )
  })
})
