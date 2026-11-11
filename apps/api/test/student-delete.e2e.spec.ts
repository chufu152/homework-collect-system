import 'reflect-metadata'
import { resolve } from 'node:path'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
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

describe('DELETE /classes/{classId}/students/{studentId}', () => {
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

  it('removes a student without submissions, rejects unknown ids, and blocks students with submissions', async () => {
    const noToken = await fetch(`${serverUrl}/api/v1/classes/current`)
    expect(noToken.status).toBe(401)

    const initialized = await api('/demo/bootstrap', { method: 'POST', body: JSON.stringify({ className: '删除演练班' }) })
    expect(initialized.response.status, JSON.stringify(initialized.body)).toBe(201)
    const classId = initialized.body.data.id as string

    const imported = await api(`/classes/${classId}/students`, {
      method: 'PUT', body: JSON.stringify({ students: [
        { studentNo: '2026001', name: '张三' }, { studentNo: '2026002', name: '李四' },
      ] }),
    })
    expect(imported.body.data).toMatchObject({ created: 2, updated: 0, rejected: [] })
    const roster = await api(`/classes/${classId}/students?pageSize=10`)
    const students = roster.body.data.items as Array<{ id: string; studentNo: string; name: string }>
    const removable = students.find((student) => student.studentNo === '2026001')!
    const submitting = students.find((student) => student.studentNo === '2026002')!

    const unknown = await api(`/classes/${classId}/students/nonexistent-id`, { method: 'DELETE' })
    expect(unknown.response.status).toBe(404)
    expect(unknown.body.code).not.toBe('OK')

    const removed = await api(`/classes/${classId}/students/${removable.id}`, { method: 'DELETE' })
    expect(removed.response.status, JSON.stringify(removed.body)).toBe(200)
    expect(removed.body.data).toMatchObject({ removed: true })
    const afterRemoval = await api(`/classes/${classId}/students?pageSize=10`)
    expect(afterRemoval.body.data.total).toBe(1)

    const repeatRemoval = await api(`/classes/${classId}/students/${removable.id}`, { method: 'DELETE' })
    expect(repeatRemoval.response.status).toBe(404)

    const published = await api('/assignments', {
      method: 'POST', body: JSON.stringify({
        title: '随堂小练', type: 'online', instructions: '请提交答案。', target: { mode: 'all' },
        submissionMode: 'text', publishNow: true,
      }),
    })
    expect(published.response.status).toBe(201)
    const shareCode = published.body.data.shareCode as string

    const form = new FormData()
    form.set('studentNo', '2026002')
    form.set('studentName', '李四')
    form.set('textContent', '答案：42')
    const submission = await api(`/public/assignments/${shareCode}/submissions`, { method: 'POST', body: form })
    expect(submission.response.status, JSON.stringify(submission.body)).toBe(201)

    const blocked = await api(`/classes/${classId}/students/${submitting.id}`, { method: 'DELETE' })
    expect(blocked.response.status, JSON.stringify(blocked.body)).toBe(409)
    expect(blocked.body.message).toContain('提交记录')
    const finalRoster = await api(`/classes/${classId}/students?pageSize=10`)
    expect(finalRoster.body.data.total).toBe(1)
  })
})
