import 'reflect-metadata'
import { resolve } from 'node:path'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { unzipSync } from 'fflate'
import { AppModule } from '../src/app.module.js'
import { HttpExceptionEnvelopeFilter } from '../src/common/http-exception.filter.js'
import { loadMigrationSql } from './migrations.js'

const adminToken = 'e2e-private-teacher-key-with-32-bytes-minimum'
let database: PGlite
let databaseServer: PGLiteSocketServer
let serverUrl = ''
let app: Awaited<ReturnType<typeof NestFactory.create>>

async function api(path: string, init: RequestInit = {}): Promise<{ response: Response; body: any }> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!path.startsWith('/public/')) headers.set('X-Demo-Admin-Token', adminToken)
  const response = await fetch(`${serverUrl}/api/v1${path}`, { ...init, headers })
  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json') ? await response.json() : null
  return { response, body }
}

describe('PostgreSQL homework core flow', () => {
  beforeAll(async () => {
    process.env.DEMO_ADMIN_TOKEN = adminToken
    process.env.PUBLIC_WEB_URL = 'http://127.0.0.1:5173'
    process.env.STORAGE_DRIVER = 'local'
    process.env.UPLOAD_DIR = resolve(process.cwd(), 'var/e2e-uploads')

    database = new PGlite()
    await database.waitReady
    databaseServer = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 4 })
    await databaseServer.start()
    const address = databaseServer.getServerConn()
    const port = address.slice(address.lastIndexOf(':') + 1)
    process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?schema=public`
    process.env.DB_POOL_MAX = '1'

    await database.exec(loadMigrationSql())

    app = await NestFactory.create(AppModule, { logger: ['error'] })
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    app.useGlobalFilters(new HttpExceptionEnvelopeFilter())
    await app.listen(0, '127.0.0.1')
    serverUrl = await app.getUrl()
  }, 120000)

  afterAll(async () => {
    if (app) await app.close()
    if (databaseServer) await databaseServer.stop()
    if (database) await database.close()
    delete process.env.DEMO_ADMIN_TOKEN
    delete process.env.DATABASE_URL
    delete process.env.DB_POOL_MAX
    delete process.env.PUBLIC_WEB_URL
    delete process.env.STORAGE_DRIVER
    delete process.env.UPLOAD_DIR
  }, 30000)

  it('initializes, imports students, publishes, uploads, reviews, and exports a homework assignment', async () => {
    const noToken = await fetch(`${serverUrl}/api/v1/classes/${'cm-no-such-class'}/students`)
    expect(noToken.status).toBe(401)

    // 未导入任何班级时，公开的密钥校验端点也必须返回可解析的 JSON 信封。
    const emptyClass = await api('/classes/verify', { method: 'POST', body: JSON.stringify({ teacherKey: 'no-such-class-key' }) })
    expect(emptyClass.response.status).toBe(401)
    expect(emptyClass.response.headers.get('content-type')).toContain('application/json')

    const initialized = await api('/classes/import', { method: 'POST', body: JSON.stringify({ className: '三年级一班', teacherKey: adminToken }) })
    expect(initialized.response.status, JSON.stringify(initialized.body)).toBe(201)
    const classId = initialized.body.data.classId as string

    const duplicateClass = await api('/classes/import', { method: 'POST', body: JSON.stringify({ className: '另一班', teacherKey: adminToken }) })
    expect(duplicateClass.response.status).toBe(409)

    const imported = await api(`/classes/${classId}/students`, {
      method: 'PUT', body: JSON.stringify({ students: [
        { studentNo: '2026001', name: '张三' }, { studentNo: '2026002', name: '李四' }, { studentNo: '2026003', name: '王五' },
      ] }),
    })
    expect(imported.body.data).toMatchObject({ created: 3, updated: 0, rejected: [] })
    const roster = await api(`/classes/${classId}/students?pageSize=10`)
    expect(roster.body.data.items).toHaveLength(3)

    const published = await api('/assignments', {
      method: 'POST', body: JSON.stringify({
        classId,
        title: '周五数学练习', type: 'online', instructions: '请提交练习答案。', target: { mode: 'all' },
        submissionMode: 'both', dueAt: '2026-11-20T12:00:00.000Z', publishNow: true,
      }),
    })
    expect(published.response.status).toBe(201)
    expect(published.body.data.expectedCount).toBe(3)
    const assignmentId = published.body.data.id as string
    const shareCode = published.body.data.shareCode as string

    const publicView = await api(`/public/assignments/${shareCode}`)
    expect(publicView.body.data).not.toHaveProperty('students')
    expect(publicView.body.data.title).toBe('周五数学练习')

    const forged = new FormData()
    forged.set('studentNo', '2026001')
    forged.set('studentName', '张三')
    forged.set('textContent', '伪造附件演练')
    forged.append('files', new Blob(['not really a pdf'], { type: 'application/pdf' }), 'fake.pdf')
    const rejectedFile = await api(`/public/assignments/${shareCode}/submissions`, { method: 'POST', body: forged })
    expect(rejectedFile.response.status).toBe(400)

    const form = new FormData()
    form.set('studentNo', '2026001')
    form.set('studentName', '张三')
    form.set('textContent', '答案：42')
    form.append('files', new Blob(['%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'], { type: 'application/pdf' }), 'answer.pdf')
    const submission = await api(`/public/assignments/${shareCode}/submissions`, { method: 'POST', body: form })
    expect(submission.response.status).toBe(201)
    expect(submission.body.data.folderName).toBe('2026001-张三-周五数学练习')
    const receiptCode = submission.body.data.receiptCode as string
    const fileId = submission.body.data.files[0].id as string

    const dashboard = await api(`/assignments/${assignmentId}/dashboard`)
    expect(dashboard.response.status, JSON.stringify(dashboard.body)).toBe(200)
    expect(dashboard.body.data.summary).toMatchObject({ expected: 3, submitted: 1, missing: 2 })
    expect(dashboard.body.data.missingMentionText).toBe('@李四 @王五')

    const feedback = await api(`/submissions/${submission.body.data.submissionId}/feedback`, {
      method: 'PATCH', body: JSON.stringify({ score: 95, feedbackText: '步骤清晰。' }),
    })
    expect(feedback.body.data.feedback.score).toBe(95)
    const receipt = await api(`/public/submissions/${receiptCode}`)
    expect(receipt.body.data.textContent).toBe('答案：42')
    expect(receipt.body.data.feedback.feedbackText).toBe('步骤清晰。')

    const downloaded = await fetch(`${serverUrl}/api/v1/public/files/${fileId}/download?receiptCode=${receiptCode}`)
    expect(downloaded.status).toBe(200)
    expect(Buffer.from(await downloaded.arrayBuffer()).toString('utf8')).toContain('%PDF-1.7')

    const docx = await api(`/assignments/${assignmentId}/exports?format=docx&submissionId=${submission.body.data.submissionId}`)
    expect(docx.response.status).toBe(200)
    expect(docx.response.headers.get('content-type')).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    const csv = await api(`/assignments/${assignmentId}/exports?format=csv`)
    expect(csv.response.status).toBe(200)
    expect(await csv.response.text()).toContain('李四')
    const zip = await api(`/assignments/${assignmentId}/exports?format=zip`)
    expect(zip.response.status).toBe(200)
    const zipContents = unzipSync(new Uint8Array(await zip.response.arrayBuffer()))
    expect(Object.keys(zipContents)).toContain('2026001-张三-周五数学练习/answer.pdf')

    const review = await api(`/assignments/${assignmentId}/dashboard`)
    const reviewedStudent = review.body.data.items.find((item: { name: string }) => item.name === '张三')
    expect(reviewedStudent.textContent).toBe('答案：42')
    expect(reviewedStudent.files[0].originalName).toBe('answer.pdf')

    const teacherDownload = await api(`/assignments/${assignmentId}/submissions/${submission.body.data.submissionId}/download?fileId=${fileId}`)
    expect(teacherDownload.response.status).toBe(200)
    expect(teacherDownload.response.headers.get('content-disposition')).toContain('answer.pdf')
    const unguardedDownload = await fetch(`${serverUrl}/api/v1/assignments/${assignmentId}/submissions/${submission.body.data.submissionId}/download?fileId=${fileId}`)
    expect(unguardedDownload.status).toBe(401)
    const wrongReceipt = await fetch(`${serverUrl}/api/v1/public/files/${fileId}/download?receiptCode=not-a-real-receipt`)
    expect(wrongReceipt.status).toBe(404)
    const wrongShare = await api('/public/assignments/not-a-real-share-code')
    expect(wrongShare.response.status).toBe(404)

    const revision = new FormData()
    revision.set('studentNo', '2026001')
    revision.set('studentName', '张三')
    revision.set('textContent', '答案：43')
    revision.append('files', new Blob(['%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'], { type: 'application/pdf' }), 'answer-v2.pdf')
    const resubmitted = await api(`/public/assignments/${shareCode}/submissions`, { method: 'POST', body: revision })
    expect(resubmitted.response.status, JSON.stringify(resubmitted.body)).toBe(201)
    expect(resubmitted.body.data.version).toBe(2)
    expect(resubmitted.body.data.receiptCode).toBe(receiptCode)
    const revisedReceipt = await api(`/public/submissions/${receiptCode}`)
    expect(revisedReceipt.body.data.textContent).toBe('答案：43')
    expect(revisedReceipt.body.data.files[0].originalName).toBe('answer-v2.pdf')
    expect(revisedReceipt.body.data.feedback).toBeNull()

    const closed = await api(`/assignments/${assignmentId}/state`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) })
    expect(closed.response.status).toBe(200)
    const closedPublic = await api(`/public/assignments/${shareCode}`)
    expect(closedPublic.response.status).toBe(404)
    const afterClose = new FormData()
    afterClose.set('studentNo', '2026001')
    afterClose.set('studentName', '张三')
    afterClose.set('textContent', '迟来的提交')
    const rejectedAfterClose = await api(`/public/assignments/${shareCode}/submissions`, { method: 'POST', body: afterClose })
    expect(rejectedAfterClose.response.status).toBe(404)
  }, 120000)
})
