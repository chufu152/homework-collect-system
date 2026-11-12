import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import type { Express } from 'express'
import { formatMissingMentions } from '@homework/contracts'
import { compareSecrets, isValidAdminToken, keyMatchesHash } from '../common/admin-token.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { formatSafeFolderName, getSubmissionStatus, resolveStudent } from './assignment-policy.js'
import { ExportsService } from '../exports/exports.service.js'
import { calculateDashboard, resolveTargetStudents, validateSubmissionAccess } from './workflows.js'
import type { AssignmentStateDto, CreateAssignmentDto, FeedbackDto, RelayEntryDto, StudentLookupDto } from './assignments.dto.js'
import { StorageService } from '../storage/storage.service.js'
import type { DownloadResult } from '../common/file-response.js'
import { safeDownloadName, validateUploadContent } from '../storage/storage-policy.js'

const FILE_TYPES = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt', 'zip'] as const

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

function requireNameMatch<T extends { id: string; studentNo: string; name: string }>(
  roster: readonly T[],
  lookup: StudentLookupDto,
): T {
  const result = resolveStudent(roster, { studentNo: lookup.studentNo, name: lookup.studentName })
  if (result.kind === 'ambiguous') throw new BadRequestException('More than one student has this name. Enter the student number.')
  if (result.kind === 'not-found') throw new BadRequestException('The student number and name do not match the class roster.')
  return result.student as T
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly exports: ExportsService,
  ) {}

  async list(query: { classId?: string; type?: string; state?: string; page?: string; pageSize?: string }) {
    const classId = query.classId?.trim()
    if (!classId) throw new BadRequestException('classId is required.')
    if (query.type && !['online', 'offline', 'checkin', 'relay'].includes(query.type)) {
      throw new BadRequestException('type must be online, offline, checkin, or relay.')
    }
    if (query.state && !['draft', 'published', 'closed'].includes(query.state)) {
      throw new BadRequestException('state must be draft, published, or closed.')
    }
    const page = Math.min(100000, Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1))
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? '20', 10) || 20))
    const where = {
      classId,
      ...(query.type ? { type: query.type as never } : {}),
      ...(query.state ? { state: query.state as never } : {}),
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          targets: { select: { studentId: true } },
          submissions: { select: { studentId: true, submittedAt: true } },
          completions: { where: { completed: true }, select: { studentId: true } },
          checkIns: { select: { studentId: true } },
          relayEntries: { select: { studentId: true } },
        },
      }),
      this.prisma.assignment.count({ where }),
    ])
    const items = rows.map((row) => {
      const summary = calculateDashboard(
        row.targets.map((target) => ({ id: target.studentId, name: '' })),
        row.submissions,
        row.dueAt,
      )
      const { targets, submissions, completions, checkIns, relayEntries, ...assignment } = row
      const completedCount = row.type === 'offline' ? completions.length
        : row.type === 'checkin' ? checkIns.length
          : row.type === 'relay' ? relayEntries.length
            : summary.submitted
      const expectedCount = targets.length
      return {
        ...assignment,
        expectedCount,
        submittedCount: completedCount,
        missingCount: Math.max(0, expectedCount - completedCount),
        shareUrl: this.shareUrl(row.shareCode),
      }
    })
    return { items, total, page, pageSize }
  }

  async create(input: CreateAssignmentDto) {
    const classroom = await this.prisma.classroom.findUnique({ where: { id: input.classId }, select: { id: true } })
    if (!classroom) throw new NotFoundException('Create the class before publishing an assignment.')
    const roster = await this.prisma.student.findMany({
      where: { classId: classroom.id },
      orderBy: [{ studentNo: 'asc' }, { id: 'asc' }],
      select: { id: true, studentNo: true, name: true },
    })
    if (!roster.length) throw new BadRequestException('Add students to the class before publishing an assignment.')

    let targetIds: string[]
    if (input.target.mode === 'all') {
      targetIds = roster.map((student) => student.id)
    } else if (input.target.mode === 'students') {
      const selected = [...new Set(input.target.studentIds ?? [])]
      targetIds = resolveTargetStudents(roster, { mode: 'students', studentIds: selected }).map((student) => student.id)
      if (targetIds.length !== selected.length) throw new BadRequestException('One or more selected students are not in this class.')
    } else {
      const groupIds = [...new Set(input.target.groupIds ?? [])]
      if (!groupIds.length) throw new BadRequestException('Choose at least one group.')
      const groups = await this.prisma.studentGroup.findMany({
        where: { id: { in: groupIds }, classId: classroom.id },
        include: { memberships: { select: { studentId: true } } },
      })
      if (groups.length !== groupIds.length) throw new BadRequestException('One or more selected groups are not in this class.')
      targetIds = resolveTargetStudents(roster, {
        mode: 'groups',
        groupStudentIds: groups.map((group) => group.memberships.map((membership) => membership.studentId)),
      }).map((student) => student.id)
    }
    if (!targetIds.length) throw new BadRequestException('The selected audience contains no students.')

    const allowedTypes = [...new Set((input.allowedFileTypes ?? ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt', 'zip'])
      .map((value) => value.replace(/^\./, '').toLowerCase()))]
    if (allowedTypes.some((type) => !(FILE_TYPES as readonly string[]).includes(type))) {
      throw new BadRequestException('One or more file types are not supported.')
    }
    const publishNow = input.publishNow === true
    const assignment = await this.prisma.assignment.create({
      data: {
        classId: classroom.id,
        title: input.title.trim(),
        type: input.type,
        instructions: input.instructions?.trim() ?? '',
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        submissionMode: input.type === 'online' ? input.submissionMode ?? 'both' : 'text',
        allowedTypes,
        maxFileCount: input.maxFileCount ?? 5,
        maxFileBytes: (input.maxFileSizeMB ?? 20) * 1024 * 1024,
        shareCode: randomBytes(24).toString('base64url'),
        state: publishNow ? 'published' : 'draft',
        publishedAt: publishNow ? new Date() : null,
        targets: { create: targetIds.map((studentId) => ({ studentId })) },
      },
      include: { _count: { select: { targets: true } } },
    })
    return {
      id: assignment.id,
      title: assignment.title,
      type: assignment.type,
      state: assignment.state,
      dueAt: assignment.dueAt,
      shareCode: assignment.shareCode,
      shareUrl: this.shareUrl(assignment.shareCode),
      expectedCount: assignment._count.targets,
    }
  }

  async setState(assignmentId: string, input: AssignmentStateDto) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } })
    if (!assignment) throw new NotFoundException('Assignment not found.')
    if (assignment.state === 'closed') throw new ConflictException('Closed assignments cannot be reopened.')
    if (input.state === 'closed' && assignment.state !== 'published') {
      throw new ConflictException('Only published assignments can be closed.')
    }
    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: input.state === 'published'
        ? { state: 'published', publishedAt: assignment.publishedAt ?? new Date() }
        : { state: 'closed', closedAt: new Date() },
    })
    return { id: updated.id, state: updated.state, shareUrl: this.shareUrl(updated.shareCode) }
  }

  async publicDetails(shareCode: string) {
    const assignment = await this.publicAssignment(shareCode)
    return {
      id: assignment.id,
      title: assignment.title,
      type: assignment.type,
      instructions: assignment.instructions,
      dueAt: assignment.dueAt,
      submissionMode: assignment.submissionMode,
      allowedFileTypes: assignment.allowedTypes,
      maxFileCount: assignment.maxFileCount,
      maxFileSizeMB: Math.floor(assignment.maxFileBytes / 1024 / 1024),
      state: assignment.state,
    }
  }

  async submit(shareCode: string, input: StudentLookupDto & { textContent?: string }, files: Express.Multer.File[]) {
    const assignment = await this.publicAssignment(shareCode)
    if (assignment.type !== 'online') throw new BadRequestException('This assignment does not accept online submissions.')
    const roster = await this.prisma.student.findMany({
      where: { id: { in: assignment.targets.map((target) => target.studentId) } },
      select: { id: true, studentNo: true, name: true },
    })
    const student = requireNameMatch(roster, input)
    const access = validateSubmissionAccess(assignment.state, assignment.targets.map((target) => target.studentId), student.id)
    if (access === 'not-targeted') throw new BadRequestException('This student is not included in the assignment audience.')
    if (access !== 'allowed') throw new ConflictException('This assignment is not accepting submissions.')
    if (assignment.submissionMode === 'text' && files.length) throw new BadRequestException('This assignment only accepts text submissions.')
    if (files.length > assignment.maxFileCount) throw new BadRequestException(`Choose no more than ${assignment.maxFileCount} files.`)
    if (files.some((file) => file.size > assignment.maxFileBytes)) {
      throw new BadRequestException(`Each file must be no larger than ${Math.floor(assignment.maxFileBytes / 1024 / 1024)} MB.`)
    }
    for (const file of files) {
      if (!await validateUploadContent(file.originalname, file.mimetype, file.buffer, assignment.allowedTypes)) {
        throw new BadRequestException(`The file type or file contents for "${safeDownloadName(file.originalname)}" are not allowed.`)
      }
    }
    const textContent = input.textContent?.trim() ?? ''
    if (assignment.submissionMode === 'text' && !textContent) throw new BadRequestException('Enter your text submission.')
    if (assignment.submissionMode === 'file' && !files.length) throw new BadRequestException('Choose at least one file.')
    if (assignment.submissionMode === 'both' && !textContent && !files.length) {
      throw new BadRequestException('Enter text or choose a file before submitting.')
    }

    const stored: Array<{ storageKey: string; originalName: string; contentType: string; sizeBytes: number }> = []
    try {
      for (const file of files) {
        const storageKey = this.storage.makeObjectKey(assignment.id, student.id, file.originalname)
        await this.storage.save(storageKey, file)
        stored.push({
          storageKey,
          originalName: safeDownloadName(file.originalname),
          contentType: file.mimetype,
          sizeBytes: file.size,
        })
      }
      const current = await this.prisma.submission.findUnique({
        where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student.id } },
        select: { id: true, version: true, receiptCode: true },
      })
      const now = new Date()
      const receiptCode = current?.receiptCode ?? randomBytes(24).toString('base64url')
      const result = await this.prisma.$transaction(async (transaction) => {
        const submission = await transaction.submission.upsert({
          where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student.id } },
          create: {
            assignmentId: assignment.id,
            studentId: student.id,
            receiptCode,
            textContent,
            submittedAt: now,
            version: 1,
          },
          update: {
            textContent,
            submittedAt: now,
            version: { increment: 1 },
          },
        })
        await transaction.feedback.deleteMany({ where: { submissionId: submission.id } })
        const version = await transaction.submissionVersion.create({
          data: {
            submissionId: submission.id,
            version: submission.version,
            textContent,
            submittedAt: now,
            files: { create: stored },
          },
          include: { files: { select: { id: true, originalName: true, sizeBytes: true } } },
        })
        return { submission, version }
      })
      return {
        submissionId: result.submission.id,
        receiptCode: result.submission.receiptCode,
        version: result.submission.version,
        submittedAt: result.submission.submittedAt,
        folderName: formatSafeFolderName(student.studentNo, student.name, assignment.title),
        files: result.version.files,
      }
    } catch (error) {
      await Promise.allSettled(stored.map((file) => this.storage.remove(file.storageKey)))
      if (isUniqueConstraint(error)) throw new ConflictException('A submission update conflicted with another request. Please retry.')
      throw error
    }
  }

  async dashboard(assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        targets: { include: { student: { select: { id: true, studentNo: true, name: true } } }, orderBy: { student: { studentNo: 'asc' } } },
        submissions: {
          include: {
            feedback: true,
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              include: { files: { select: { id: true, originalName: true, sizeBytes: true } } },
            },
          },
        },
        completions: true,
        checkIns: true,
        relayEntries: true,
      },
    })
    if (!assignment) throw new NotFoundException('Assignment not found.')

    const targets = assignment.targets.map((target) => target.student)
    const summary = calculateDashboard(
      targets,
      assignment.submissions.map((submission) => ({ studentId: submission.studentId, submittedAt: submission.submittedAt })),
      assignment.dueAt,
    )
    const submissions = new Map(assignment.submissions.map((submission) => [submission.studentId, submission]))
    const completions = new Set(assignment.completions.filter((entry) => entry.completed).map((entry) => entry.studentId))
    const checkedIn = new Set(assignment.checkIns.map((entry) => entry.studentId))
    const relayed = new Set(assignment.relayEntries.map((entry) => entry.studentId))

    const items = targets.map((student) => {
      const submission = submissions.get(student.id)
      const onlineStatus = getSubmissionStatus(submission?.submittedAt ?? null, assignment.dueAt)
      const status = assignment.type === 'online' ? onlineStatus
        : assignment.type === 'offline' ? completions.has(student.id) ? 'completed' : 'missing'
          : assignment.type === 'checkin' ? checkedIn.has(student.id) ? 'checked_in' : 'missing'
            : relayed.has(student.id) ? 'joined' : 'missing'
      return {
        studentId: student.id,
        studentNo: student.studentNo,
        name: student.name,
        submissionId: submission?.id ?? null,
        status,
        submittedAt: submission?.submittedAt ?? null,
        textContent: submission?.textContent ?? '',
        files: submission?.versions[0]?.files ?? [],
        score: submission?.feedback?.score ?? null,
        feedbackText: submission?.feedback?.feedbackText ?? null,
      }
    })
    const completedCount = items.filter((item) => item.status !== 'missing').length
    const missingNames = items.filter((item) => item.status === 'missing').map((item) => item.name)
    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        type: assignment.type,
        state: assignment.state,
        dueAt: assignment.dueAt,
        shareUrl: this.shareUrl(assignment.shareCode),
      },
      summary: {
        expected: targets.length,
        submitted: assignment.type === 'online' ? summary.submitted : completedCount,
        missing: assignment.type === 'online' ? summary.missing : items.filter((item) => item.status === 'missing').length,
        late: assignment.type === 'online' ? summary.late : 0,
      },
      items,
      missingMentionText: formatMissingMentions(missingNames),
    }
  }

  async feedback(submissionId: string, input: FeedbackDto) {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId }, select: { id: true } })
    if (!submission) throw new NotFoundException('Submission not found.')
    const feedback = await this.prisma.feedback.upsert({
      where: { submissionId },
      create: { submissionId, score: input.score, feedbackText: input.feedbackText.trim() },
      update: { score: input.score, feedbackText: input.feedbackText.trim(), reviewedAt: new Date() },
    })
    return { submissionId, feedback }
  }

  async receipt(receiptCode: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { receiptCode },
      include: {
        assignment: { select: { id: true, title: true, type: true, dueAt: true } },
        feedback: true,
        versions: { orderBy: { version: 'desc' }, include: { files: { select: { id: true, originalName: true, contentType: true, sizeBytes: true } } } },
      },
    })
    if (!submission) throw new NotFoundException('Submission receipt not found.')
    return {
      assignment: submission.assignment,
      submittedAt: submission.submittedAt,
      version: submission.version,
      textContent: submission.textContent,
      files: submission.versions[0]?.files ?? [],
      feedback: submission.feedback,
      versions: submission.versions.map((version) => ({
        version: version.version,
        submittedAt: version.submittedAt,
        textContent: version.textContent,
        files: version.files,
      })),
    }
  }

  /** Teacher-side history for a single submission; file ids can be downloaded via the existing protected routes. */
  async listVersions(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        version: true,
        versions: {
          orderBy: { version: 'desc' },
          select: {
            version: true,
            textContent: true,
            submittedAt: true,
            files: { select: { id: true, originalName: true, contentType: true, sizeBytes: true } },
          },
        },
      },
    })
    if (!submission) throw new NotFoundException('Submission not found.')
    return {
      submissionId: submission.id,
      currentVersion: submission.version,
      items: submission.versions.map((version) => ({
        version: version.version,
        submittedAt: version.submittedAt,
        textContent: version.textContent,
        files: version.files,
      })),
    }
  }

  async setCompletion(assignmentId: string, studentId: string, completed: boolean) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { targets: { select: { studentId: true } } },
    })
    if (!assignment) throw new NotFoundException('Assignment not found.')
    if (assignment.type !== 'offline') throw new BadRequestException('Completion toggles are only available for offline assignments.')
    if (!assignment.targets.some((target) => target.studentId === studentId)) {
      throw new BadRequestException('This student is not included in the assignment audience.')
    }
    const record = await this.prisma.completionRecord.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      create: { assignmentId, studentId, completed, completedAt: completed ? new Date() : null },
      update: { completed, completedAt: completed ? new Date() : null },
    })
    return { studentId, completed: record.completed, completedAt: record.completedAt }
  }

  async checkIn(shareCode: string, input: StudentLookupDto) {
    const assignment = await this.publicAssignment(shareCode)
    if (assignment.type !== 'checkin') throw new BadRequestException('This assignment is not a check-in.')
    const targets = await this.prisma.student.findMany({
      where: { id: { in: assignment.targets.map((target) => target.studentId) } },
      select: { id: true, studentNo: true, name: true },
    })
    const student = requireNameMatch(targets, input)
    const inserted = await this.prisma.checkIn.createMany({
      data: [{ assignmentId: assignment.id, studentId: student.id }],
      skipDuplicates: true,
    })
    const record = await this.prisma.checkIn.findUniqueOrThrow({
      where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student.id } },
    })
    return { studentId: student.id, displayName: student.name, checkedInAt: record.checkedInAt, alreadyCheckedIn: inserted.count === 0 }
  }

  async relayEntries(shareCode: string) {
    const assignment = await this.publicAssignment(shareCode)
    if (assignment.type !== 'relay') throw new BadRequestException('This assignment is not a relay.')
    const entries = await this.prisma.relayEntry.findMany({
      where: { assignmentId: assignment.id },
      orderBy: { position: 'asc' },
      include: { student: { select: { name: true, studentNo: true } } },
    })
    return {
      items: entries.map((entry) => ({
        entryId: entry.id,
        position: entry.position,
        displayName: entry.student.name,
        content: entry.content,
        createdAt: entry.createdAt,
      })),
      total: entries.length,
    }
  }

  async joinRelay(shareCode: string, input: RelayEntryDto) {
    const assignment = await this.publicAssignment(shareCode)
    if (assignment.type !== 'relay') throw new BadRequestException('This assignment is not a relay.')
    const targets = await this.prisma.student.findMany({
      where: { id: { in: assignment.targets.map((target) => target.studentId) } },
      select: { id: true, studentNo: true, name: true },
    })
    const student = requireNameMatch(targets, input)
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const count = await transaction.relayEntry.count({ where: { assignmentId: assignment.id } })
        const entry = await transaction.relayEntry.create({
          data: {
            assignmentId: assignment.id,
            studentId: student.id,
            position: count + 1,
            content: input.content?.trim() ?? '',
          },
        })
        return { entryId: entry.id, position: entry.position, createdAt: entry.createdAt }
      }, { isolationLevel: 'Serializable' })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new ConflictException('This student has already joined, or the list changed concurrently. Refresh the list and retry.')
      throw error
    }
  }

  async getDownload(fileId: string, receiptCode?: string, adminToken?: string): Promise<DownloadResult> {
    const file = await this.prisma.submissionFile.findUnique({
      where: { id: fileId },
      include: { version: { include: { submission: { select: { receiptCode: true, assignmentId: true } } } } },
    })
    if (!file) throw new NotFoundException('File not found.')
    const hasAdminAccess = await this.hasTeacherAccess(file.version.submission.assignmentId, adminToken)
    if (!hasAdminAccess && !compareSecrets(receiptCode, file.version.submission.receiptCode)) {
      throw new NotFoundException('File not found.')
    }
    const redirectUrl = this.storage.presignedDownloadUrl(file.storageKey, file.originalName)
    if (redirectUrl) return { redirectUrl }
    return {
      content: await this.storage.openReadStream(file.storageKey),
      contentType: file.contentType,
      downloadName: safeDownloadName(file.originalName),
      sizeBytes: file.sizeBytes,
    }
  }

  /** 教师无回执码下载附件时，用「提交所属班级」的独立密钥校验；历史班级回退部署级令牌。 */
  private async hasTeacherAccess(assignmentId: string, adminToken?: string): Promise<boolean> {
    if (!adminToken?.trim()) return false
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { classroom: { select: { teacherKeyHash: true } } },
    })
    if (!assignment) return false
    if (assignment.classroom.teacherKeyHash) {
      return keyMatchesHash(adminToken, assignment.classroom.teacherKeyHash)
    }
    return isValidAdminToken(adminToken)
  }

  async getSubmissionDownload(assignmentId: string, submissionId: string, fileId: string): Promise<DownloadResult> {
    const file = await this.prisma.submissionFile.findFirst({
      where: { id: fileId, version: { submission: { id: submissionId, assignmentId } } },
      select: { storageKey: true, contentType: true, originalName: true, sizeBytes: true },
    })
    if (!file) throw new NotFoundException('File not found.')
    const redirectUrl = this.storage.presignedDownloadUrl(file.storageKey, file.originalName)
    if (redirectUrl) return { redirectUrl }
    return {
      content: await this.storage.openReadStream(file.storageKey),
      contentType: file.contentType,
      downloadName: safeDownloadName(file.originalName),
      sizeBytes: file.sizeBytes,
    }
  }

  async exportCsv(assignmentId: string): Promise<{ filename: string; content: Buffer }> {
    const dashboard = await this.dashboard(assignmentId)
    const rows = [
      ['studentNo', 'name', 'status', 'submittedAt', 'score', 'feedback'],
      ...dashboard.items.map((item) => [
        item.studentNo,
        item.name,
        item.status,
        item.submittedAt?.toISOString() ?? '',
        item.score == null ? '' : String(item.score),
        item.feedbackText ?? '',
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => {
      const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
      return `"${safe.replace(/"/g, '""')}"`
    }).join(',')).join('\r\n')
    return { filename: `${this.fileBase(dashboard.assignment.title)}.csv`, content: Buffer.from(`\ufeff${csv}`, 'utf8') }
  }

  async exportDocx(assignmentId: string, submissionId?: string): Promise<{ filename: string; content: Buffer }> {
    if (!submissionId) throw new BadRequestException('submissionId is required for DOCX export.')
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, assignmentId },
      include: { student: true, assignment: true, feedback: true },
    })
    if (!submission) throw new NotFoundException('Submission not found for this assignment.')
    const { Document, Packer, Paragraph, TextRun } = await import('docx')
    const document = new Document({ sections: [{ children: [
      new Paragraph({ children: [new TextRun({ text: submission.assignment.title, bold: true, size: 32 })] }),
      new Paragraph(`学生：${submission.student.studentNo} ${submission.student.name}`),
      new Paragraph(`提交时间：${submission.submittedAt.toLocaleString('zh-CN')}`),
      new Paragraph(''),
      ...submission.textContent.split(/\r?\n/).map((line) => new Paragraph(line)),
      ...(submission.feedback ? [new Paragraph(''), new Paragraph(`教师反馈：${submission.feedback.feedbackText}`)] : []),
    ] }] })
    return {
      filename: `${this.fileBase(submission.student.studentNo + '-' + submission.student.name + '-' + submission.assignment.title)}.docx`,
      content: await Packer.toBuffer(document),
    }
  }

  async exportZip(assignmentId: string): Promise<{ filename: string; content: Buffer }> {
    return this.exports.exportSubmissionFiles(assignmentId)
  }

  private async publicAssignment(shareCode: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { shareCode },
      include: { targets: { select: { studentId: true } } },
    })
    if (!assignment || assignment.state !== 'published') throw new NotFoundException('Assignment not found or no longer accepting responses.')
    return assignment
  }

  private shareUrl(shareCode: string): string {
    const origin = (process.env.PUBLIC_WEB_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '')
    return `${origin}/a/${encodeURIComponent(shareCode)}`
  }

  private fileBase(value: string): string {
    return value.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/\.+/g, '-').trim().replace(/[.\s-]+$/g, '').slice(0, 120) || 'export'
  }
}
