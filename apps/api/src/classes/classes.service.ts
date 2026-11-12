import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service.js'
import { hashTeacherKey, isValidTeacherKeyFormat, keyMatchesHash } from '../common/admin-token.js'
import { partitionIntoGroups } from '../assignments/workflows.js'
import type { CreateGroupDto, ImportClassDto, ImportStudentsDto, VerifyClassKeyDto } from './classes.dto.js'

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

  /**
   * 导入班级：支持「建立新班级」与「把已有班级导入当前浏览器」两种语义。
   * - 班级名不存在 → 用该密钥建立新班级；
   * - 班级名已存在且密钥匹配 → 视为重复导入，直接返回班级信息（幂等）；
   * - 班级名已存在但密钥不匹配 → 拒绝；
   * - 同一密钥不允许绑定到多个班级名。
   * 历史班级（迁移前创建、teacherKeyHash 为空）在首次导入时认领提交的密钥。
   */
  async importClass(input: ImportClassDto) {
    const className = input.className.trim()
    const key = input.teacherKey.trim()
    if (!isValidTeacherKeyFormat(key)) {
      throw new BadRequestException('班级密钥至少需要 8 个字符。')
    }
    const hash = hashTeacherKey(key)

    const existing = await this.prisma.classroom.findFirst({
      where: { name: className },
      include: { _count: { select: { students: true } } },
    })
    if (existing) {
      if (!existing.teacherKeyHash) {
        await this.prisma.classroom.update({ where: { id: existing.id }, data: { teacherKeyHash: hash } })
      } else if (!keyMatchesHash(key, existing.teacherKeyHash)) {
        throw new ConflictException('该班级已存在，密钥不匹配。')
      }
      return { classId: existing.id, name: existing.name, studentCount: existing._count.students }
    }

    const keyOwner = await this.prisma.classroom.findFirst({
      where: { teacherKeyHash: hash },
      select: { name: true },
    })
    if (keyOwner) throw new ConflictException('该密钥已被其他班级使用，请更换密钥。')

    const created = await this.prisma.classroom.create({
      data: { name: className, teacherKeyHash: hash },
      include: { _count: { select: { students: true } } },
    })
    return { classId: created.id, name: created.name, studentCount: created._count.students }
  }

  /** 用密钥换取班级信息（一个密钥只对应一个班级）。 */
  async verifyClassKey(input: VerifyClassKeyDto) {
    const key = input.teacherKey.trim()
    if (!isValidTeacherKeyFormat(key)) {
      throw new BadRequestException('班级密钥至少需要 8 个字符。')
    }
    const classroom = await this.prisma.classroom.findFirst({
      where: { teacherKeyHash: hashTeacherKey(key) },
      include: { _count: { select: { students: true } } },
    })
    if (!classroom) throw new UnauthorizedException('班级密钥不匹配，没有找到对应的班级。')
    return { classId: classroom.id, name: classroom.name, studentCount: classroom._count.students }
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
