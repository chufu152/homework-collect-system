import 'reflect-metadata'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { unzipSync } from 'fflate'
import { loadMigrationSql } from './migrations.js'

const adminToken = 'e2e-private-teacher-key-with-32-bytes-minimum'
const PDF = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'
let database: PGlite
let databaseServer: PGLiteSocketServer
let serverUrl = ''
let app: Awaited<ReturnType<typeof NestFactory.create>>

async function api(path: string, init: RequestInit = {}): Promise<{ response: Response; body: any }> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!path.startsWith('/public/')) headers.set('X-Demo-Admin-Token', adminToken)
  const response = await fetch(`${serverUrl}/api/v1${path}`, { ...init, headers })
  return {
    response,
    body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : null,
  }
}

function submissionForm(studentNo: string, studentName: string, text: string, files: Array<[string, string]> = []): FormData {
  const form = new FormData()
  form.set('studentNo', studentNo)
  form.set('studentName', studentName)
  form.set('textContent', text)
  for (const [name, content] of files) {
    form.append('files', new Blob([content], { type: 'application/pdf' }), name)
  }
  return form
}

describe('backend completion: readiness, validation, history and streaming', () => {
  beforeAll(async () => {
    // Read before importing AppModule: multer limits are fixed when the
    // controller decorators are evaluated.
    process.env.DEMO_ADMIN_TOKEN = adminToken
    process.env.PUBLIC_WEB_URL = 'http://127.0.0.1:5173'
    process.env.STORAGE_DRIVER = 'local'
    process.env.UPLOAD_DIR = resolve(process.cwd(), 'var/e2e-completion-uploads')
    process.env.MAX_UPLOAD_BYTES = '1024'
    process.env.RATE_LIMIT_ENABLED = 'false'
    process.env.AUDIT_LOG_ENABLED = 'false'
    process.env.DB_POOL_MAX = '1'

    database = new PGlite()
    await database.waitReady
    databaseServer = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 4 })
    await databaseServer.start()
    const port = Number(databaseServer.getServerConn().split(':').pop())
    process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?schema=public`
    await database.exec(loadMigrationSql())

    const { AppModule } = await import('../src/app.module.js')
    const { HttpExceptionEnvelopeFilter } = await import('../src/common/http-exception.filter.js')
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
    for (const key of ['DEMO_ADMIN_TOKEN', 'DATABASE_URL', 'DB_POOL_MAX', 'PUBLIC_WEB_URL', 'STORAGE_DRIVER', 'UPLOAD_DIR', 'MAX_UPLOAD_BYTES', 'RATE_LIMIT_ENABLED', 'AUDIT_LOG_ENABLED']) delete process.env[key]
  }, 30000)

  it('covers the newly completed backend behaviour end to end', async () => {
    const health = await fetch(`${serverUrl}/api/v1/health`)
    const healthBody = await health.json()
    expect(health.status, JSON.stringify(healthBody)).toBe(200)
    expect(healthBody.code).toBe('OK')
    expect(healthBody.data.status).toBe('ok')

    const initialized = await api('/demo/bootstrap', { method: 'POST', body: JSON.stringify({ className: '八年级一班' }) })
    const classId = initialized.body.data.id as string
    await api(`/classes/${classId}/students`, {
      method: 'PUT', body: JSON.stringify({ students: [
        { studentNo: '8001', name: '周同学' }, { studentNo: '8002', name: '吴同学' },
      ] }),
    })

    const created = await api('/assignments', {
      method: 'POST', body: JSON.stringify({
        title: '后端验收作业', type: 'online', submissionMode: 'both', publishNow: true, target: { mode: 'all' },
      }),
    })
    expect(created.response.status, JSON.stringify(created.body)).toBe(201)
    const assignmentId = created.body.data.id as string
    const shareCode = created.body.data.shareCode as string

    // DTO validation: an oversized multipart text field is rejected, not a 500.
    const oversizedText = await api(`/public/assignments/${shareCode}/submissions`, {
      method: 'POST', body: submissionForm('8001', '周同学', 'x'.repeat(20001)),
    })
    expect(oversizedText.response.status).toBe(400)
    expect(oversizedText.body.code).toBe('VALIDATION_ERROR')

    // multer limit: a file above MAX_UPLOAD_BYTES yields the documented 413 envelope.
    const oversizedFile = await api(`/public/assignments/${shareCode}/submissions`, {
      method: 'POST', body: submissionForm('8001', '周同学', '答案', [['large.pdf', `${PDF}${'x'.repeat(2000)}`]]),
    })
    expect(oversizedFile.response.status, JSON.stringify(oversizedFile.body)).toBe(413)
    expect(oversizedFile.body.code).toBe('FILE_TOO_LARGE')

    // Two same-named attachments must not break the ZIP export.
    const first = await api(`/public/assignments/${shareCode}/submissions`, {
      method: 'POST', body: submissionForm('8001', '周同学', '第一版', [['answer.pdf', PDF], ['answer.pdf', PDF]]),
    })
    expect(first.response.status, JSON.stringify(first.body)).toBe(201)
    const submissionId = first.body.data.submissionId as string
    const receiptCode = first.body.data.receiptCode as string
    const firstFileId = first.body.data.files[0].id as string
    expect(first.body.data.files).toHaveLength(2)

    const zip = await api(`/assignments/${assignmentId}/exports?format=zip`)
    expect(zip.response.status).toBe(200)
    const names = Object.keys(unzipSync(new Uint8Array(await zip.response.arrayBuffer())))
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2)

    const second = await api(`/public/assignments/${shareCode}/submissions`, {
      method: 'POST', body: submissionForm('8001', '周同学', '第二版', [['answer-v2.pdf', PDF]]),
    })
    expect(second.response.status, JSON.stringify(second.body)).toBe(201)
    expect(second.body.data.version).toBe(2)
    expect(second.body.data.receiptCode).toBe(receiptCode)

    // Version history is reachable for the teacher and (own) student.
    const history = await api(`/submissions/${submissionId}/versions`)
    expect(history.response.status, JSON.stringify(history.body)).toBe(200)
    expect(history.body.data.currentVersion).toBe(2)
    expect(history.body.data.items.map((item: { version: number }) => item.version)).toEqual([2, 1])
    expect(history.body.data.items[1].files).toHaveLength(2)

    const receipt = await api(`/public/submissions/${receiptCode}`)
    expect(receipt.body.data.version).toBe(2)
    expect(receipt.body.data.versions.map((item: { version: number }) => item.version)).toEqual([2, 1])
    expect(receipt.body.data.files[0].originalName).toBe('answer-v2.pdf')

    // Historical attachments stream through both protected download routes.
    const studentDownload = await fetch(`${serverUrl}/api/v1/public/files/${firstFileId}/download?receiptCode=${receiptCode}`)
    expect(studentDownload.status).toBe(200)
    expect(Buffer.from(await studentDownload.arrayBuffer()).toString()).toContain('%PDF-1.7')
    expect(studentDownload.headers.get('content-length')).toBe(String(PDF.length))

    const teacherDownload = await api(`/assignments/${assignmentId}/submissions/${submissionId}/download?fileId=${firstFileId}`)
    expect(teacherDownload.response.status).toBe(200)
    expect(teacherDownload.response.headers.get('content-disposition')).toContain('answer.pdf')

    const unguarded = await fetch(`${serverUrl}/api/v1/files/${firstFileId}/download`)
    expect(unguarded.status).toBe(404)

    // Text-only assignments must not silently store uploaded files.
    const textOnly = await api('/assignments', {
      method: 'POST', body: JSON.stringify({
        title: '纯文本作业', type: 'online', submissionMode: 'text', publishNow: true, target: { mode: 'all' },
      }),
    })
    const textOnlyCode = textOnly.body.data.shareCode as string
    const rejectedFile = await api(`/public/assignments/${textOnlyCode}/submissions`, {
      method: 'POST', body: submissionForm('8001', '周同学', '答案', [['answer.pdf', PDF]]),
    })
    expect(rejectedFile.response.status, JSON.stringify(rejectedFile.body)).toBe(400)
  }, 120000)
})
