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
    for (const submission of assignment.submissions) {
      const folder = `${submission.student.studentNo}-${submission.student.name}-${assignment.title}`
        .normalize('NFKC')
        .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
        .replace(/\.+/g, '-')
        .trim()
      for (const file of submission.versions[0]?.files ?? []) {
        entries.push({
          name: `${folder}/${safeDownloadName(file.originalName)}`,
          content: await this.storage.read(file.storageKey),
        })
      }
    }
    const filename = assignment.title.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').slice(0, 120) || '作业'
    return { filename: `${filename}.zip`, content: await createZipArchive(entries) }
  }
}
