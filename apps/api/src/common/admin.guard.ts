import { CanActivate, ExecutionContext, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { PrismaService } from '../prisma/prisma.service.js'
import { isConfiguredAdminToken, isValidAdminToken, isValidTeacherKeyFormat, keyMatchesHash } from './admin-token.js'

/**
 * 每个班级持有独立密钥（Classroom.teacherKeyHash，SHA-256）。
 * 守卫从路由中解析出本次操作归属的班级：
 * - `:classId` 直接可得；
 * - `:assignmentId` / `:submissionId` 通过数据库回溯到班级；
 * - 列表/创建类接口要求显式携带 `classId`（query 或 body）。
 * teacherKeyHash 为空的历史班级回退到部署级 DEMO_ADMIN_TOKEN。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const supplied = request.header('x-demo-admin-token') ?? ''
    if (!isValidTeacherKeyFormat(supplied)) {
      throw new UnauthorizedException('A valid teacher key is required.')
    }

    const classId = await this.resolveClassId(request)
    if (!classId) {
      throw new UnauthorizedException('A valid teacher key is required.')
    }
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      select: { teacherKeyHash: true },
    })
    if (!classroom) throw new NotFoundException('Class not found.')

    if (classroom.teacherKeyHash) {
      if (!keyMatchesHash(supplied, classroom.teacherKeyHash)) {
        throw new UnauthorizedException('A valid teacher key is required.')
      }
      return true
    }

    // 历史班级（迁移前创建）还没有班级密钥：回退到部署级令牌。
    if (!isConfiguredAdminToken()) {
      throw new ServiceUnavailableException('This class predates per-class keys. Set DEMO_ADMIN_TOKEN or re-import the class to set its key.')
    }
    if (!isValidAdminToken(supplied)) {
      throw new UnauthorizedException('A valid teacher key is required.')
    }
    return true
  }

  private async resolveClassId(request: Request): Promise<string | null> {
    const params = request.params ?? {}
    if (typeof params.classId === 'string' && params.classId) return params.classId
    if (typeof params.assignmentId === 'string' && params.assignmentId) {
      const assignment = await this.prisma.assignment.findUnique({
        where: { id: params.assignmentId },
        select: { classId: true },
      })
      return assignment?.classId ?? null
    }
    if (typeof params.submissionId === 'string' && params.submissionId) {
      const submission = await this.prisma.submission.findUnique({
        where: { id: params.submissionId },
        select: { assignment: { select: { classId: true } } },
      })
      return submission?.assignment.classId ?? null
    }
    const bodyClassId = (request.body as Record<string, unknown> | undefined)?.classId
    if (typeof bodyClassId === 'string' && bodyClassId) return bodyClassId
    if (typeof request.query.classId === 'string' && request.query.classId) return request.query.classId
    return null
  }
}
