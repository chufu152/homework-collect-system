import { Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { StorageService } from '../storage/storage.service.js'
import { safeDownloadName } from '../storage/storage-policy.js'
import { createZipArchive } from './zip-archive.js'

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  async exportSubmissionFiles(assignmentId: string): Promise<{ filename: string; content: Buffer }> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        submissions: {
          include: {
            student: { select: { id: true, studentNo: true, name: true } },
            versions: { orderBy: { version: 'desc' }, take: 1, include: { files: true } },
          },
        },
      },
    })
    if (!assignment) throw new NotFoundException('Assignment not found.')
    const totalBytes = assignment.submissions.flatMap((submission) => submission.versions[0]?.files ?? [])
      .reduce((total, file) => total + file.sizeBytes, 0)
    const maximumBytes = Number(process.env.MAX_EXPORT_BYTES ?? 209715200)
    if (totalBytes > maximumBytes) throw new PayloadTooLargeException(`ZIP export exceeds the ${Math.floor(maximumBytes / 1024 / 1024)} MB safety limit.`)
    const entries: Array<{ name: string; content: Buffer }> = []
    const usedNames = new Set<string>()
    const isLeave = assignment.type === 'leave'
    for (const submission of assignment.submissions) {
      const folder = isLeave
        ? ''
        : `${submission.student.studentNo}-${submission.student.name}-${assignment.title}`
          .normalize('NFKC')
          .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
          .replace(/\.+/g, '-')
          .trim() || 'submission'
      for (const file of submission.versions[0]?.files ?? []) {
        let entryName: string
        if (isLeave) {
          // 假条：按日期分组文件夹，文件命名为「姓名-日期」，同名追加序号。
          const date = (file.slipDate ?? submission.submittedAt).toISOString().slice(0, 10)
          const ext = file.originalName.includes('.') ? file.originalName.slice(file.originalName.lastIndexOf('.')).toLowerCase() : ''
          const base = `${submission.student.name}-${date}`
          entryName = `${date}/${base}${ext}`
          let counter = 2
          while (usedNames.has(entryName)) {
            entryName = `${date}/${base}-${counter}${ext}`
            counter += 1
          }
        } else {
          entryName = `${folder}/${safeDownloadName(file.originalName)}`
        }
        usedNames.add(entryName)
        entries.push({
          name: entryName,
          content: await this.storage.read(file.storageKey),
        })
      }
    }
    const filename = assignment.title.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').slice(0, 120) || '作业'
    return { filename: `${filename}.zip`, content: await createZipArchive(entries) }
  }
}
