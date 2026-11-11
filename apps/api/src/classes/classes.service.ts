import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service.js'
import { partitionIntoGroups } from '../assignments/workflows.js'
import type { BootstrapDto, CreateGroupDto, ImportStudentsDto } from './classes.dto.js'

function shuffle<T>(values: T[]): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

function pageValue(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(input: BootstrapDto) {
    const existing = await this.prisma.demoState.findUnique({ where: { id: 'demo' }, select: { id: true } })
    if (existing) throw new ConflictException('This demo already has a class.')
    const legacyClass = await this.prisma.classroom.findFirst({ select: { id: true } })
    if (legacyClass) throw new ConflictException('This demo already has a class.')
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const classroom = await transaction.classroom.create({
          data: { name: input.className.trim() },
          include: { _count: { select: { students: true } } },
        })
        await transaction.demoState.create({ data: { id: 'demo', classId: classroom.id } })
        return classroom
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new ConflictException('This demo already has a class.')
      throw error
    }
  }

  async current() {
    const state = await this.prisma.demoState.findUnique({ where: { id: 'demo' }, select: { classId: true } })
    const classroom = state
      ? await this.prisma.classroom.findUnique({ where: { id: state.classId }, include: { _count: { select: { students: true } } } })
      : await this.prisma.classroom.findFirst({
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { students: true } } },
      })
    if (!classroom) return null
    return {
      classId: classroom.id,
      name: classroom.name,
      studentCount: classroom._count.students,
    }
  }

  async listStudents(classId: string, query: { keyword?: string; groupId?: string; page?: string; pageSize?: string }) {
    await this.requireClass(classId)
    const page = pageValue(query.page, 1, 100000)
    const pageSize = pageValue(query.pageSize, 50, 100)
    const keyword = query.keyword?.trim()
    const where = {
      classId,
      ...(keyword ? {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' as const } },
          { studentNo: { contains: keyword, mode: 'insensitive' as const } },
        ],
      } : {}),
      ...(query.groupId ? { memberships: { some: { groupId: query.groupId } } } : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy: [{ studentNo: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { memberships: { include: { group: { select: { id: true, name: true } } } } },
      }),
      this.prisma.student.count({ where }),
    ])
    return {
      items: items.map(({ memberships, ...student }) => ({
        ...student,
        groups: memberships.map(({ group }) => group),
      })),
      total,
      page,
      pageSize,
    }
  }

  async importStudents(classId: string, input: ImportStudentsDto) {
    await this.requireClass(classId)
    const seen = new Set<string>()
    const rejected: Array<{ row: number; reason: string }> = []
    const accepted: Array<{ studentNo: string; name: string }> = []

    input.students.forEach((student, index) => {
      const studentNo = student.studentNo.trim()
      const name = student.name.trim()
      if (!studentNo || !name) {
        rejected.push({ row: index + 1, reason: 'Student number and name are required.' })
      } else if (seen.has(studentNo)) {
        rejected.push({ row: index + 1, reason: 'Student number appears more than once in this import.' })
      } else {
        seen.add(studentNo)
        accepted.push({ studentNo, name })
      }
    })
    if (accepted.length === 0) throw new BadRequestException('No valid students were provided.')

    let created = 0
    let updated = 0
    await this.prisma.$transaction(async (transaction) => {
      for (const student of accepted) {
        const existing = await transaction.student.findUnique({
          where: { classId_studentNo: { classId, studentNo: student.studentNo } },
          select: { id: true },
        })
        await transaction.student.upsert({
          where: { classId_studentNo: { classId, studentNo: student.studentNo } },
          create: { classId, studentNo: student.studentNo, name: student.name },
          update: { name: student.name },
        })
        if (existing) updated += 1
        else created += 1
      }
    })
    return { created, updated, rejected }
  }

  async deleteStudent(classId: string, studentId: string) {
    await this.requireClass(classId)
    const student = await this.prisma.student.findFirst({ where: { id: studentId, classId }, select: { id: true } })
    if (!student) throw new NotFoundException('Student not found in this class.')
    const submissionCount = await this.prisma.submission.count({ where: { studentId } })
    if (submissionCount > 0) {
      throw new ConflictException('该学生已有提交记录，为保证作业统计完整，无法删除。')
    }
    await this.prisma.student.delete({ where: { id: studentId } })
    return { removed: true }
  }

  async listGroups(classId: string) {
    await this.requireClass(classId)
    const groups = await this.prisma.studentGroup.findMany({
      where: { classId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { memberships: true } } },
    })
    return groups.map(({ _count, ...group }) => ({ ...group, memberCount: _count.memberships }))
  }

  async createGroups(classId: string, input: CreateGroupDto) {
    await this.requireClass(classId)
    const strategy = input.strategy ?? 'manual'
    if (strategy === 'balanced_random') {
      const groupCount = input.groupCount
      if (!groupCount) throw new BadRequestException('Group count is required for balanced random grouping.')
      const students = await this.prisma.student.findMany({
        where: { classId },
        orderBy: [{ studentNo: 'asc' }, { id: 'asc' }],
        select: { id: true },
      })
      if (groupCount > students.length) throw new BadRequestException('Group count cannot exceed the number of students.')
      const buckets = partitionIntoGroups(shuffle(students.map((student) => student.id)), groupCount)
      try {
        const groups = await this.prisma.$transaction(buckets.map((studentIds, index) =>
          this.prisma.studentGroup.create({
            data: {
              classId,
              name: `${input.name.trim()} ${index + 1}`,
              strategy: 'balanced_random',
              memberships: { create: studentIds.map((studentId) => ({ studentId })) },
            },
            include: { _count: { select: { memberships: true } } },
          }),
        ))
        return groups.map(({ _count, ...group }) => ({ ...group, memberCount: _count.memberships }))
      } catch (error) {
        if (isUniqueConstraint(error)) throw new ConflictException('A group with this name already exists in the class.')
        throw error
      }
    }

    const studentIds = [...new Set((input.studentIds ?? []).map((studentId) => studentId.trim()).filter(Boolean))]
    if (!studentIds.length) throw new BadRequestException('Choose at least one student for a manual group.')
    const found = await this.prisma.student.count({ where: { classId, id: { in: studentIds } } })
    if (found !== studentIds.length) throw new BadRequestException('One or more students are not in this class.')
    try {
      const group = await this.prisma.studentGroup.create({
        data: {
          classId,
          name: input.name.trim(),
          strategy: 'manual',
          memberships: { create: studentIds.map((studentId) => ({ studentId })) },
        },
        include: { _count: { select: { memberships: true } } },
      })
      const { _count, ...data } = group
      return { ...data, memberCount: _count.memberships }
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('A group with this name already exists in the class.')
      }
      throw error
    }
  }

  private async requireClass(classId: string): Promise<void> {
    const exists = await this.prisma.classroom.findUnique({ where: { id: classId }, select: { id: true } })
    if (!exists) throw new NotFoundException('Class not found.')
  }
}
