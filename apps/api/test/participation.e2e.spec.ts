import 'reflect-metadata'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

async function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!path.startsWith('/public/')) headers.set('X-Demo-Admin-Token', adminToken)
  const response = await fetch(`${serverUrl}/api/v1${path}`, { ...init, headers })
  return { response, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : null }
}

describe('offline, check-in, and relay assignment flows', () => {
  beforeAll(async () => {
    process.env.DEMO_ADMIN_TOKEN = adminToken
    process.env.PUBLIC_WEB_URL = 'http://127.0.0.1:5173'
    process.env.STORAGE_DRIVER = 'local'
    process.env.UPLOAD_DIR = resolve(process.cwd(), 'var/e2e-uploads')
    database = new PGlite()
    await database.waitReady
    databaseServer = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 4 })
    await databaseServer.start()
    const port = Number(databaseServer.getServerConn().split(':').pop())
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

  beforeEach(async () => {
    if (database) await database.exec(`
      TRUNCATE TABLE "DemoState", "RelayEntry", "CheckIn", "CompletionRecord", "Feedback", "SubmissionFile", "SubmissionVersion", "Submission", "AssignmentTarget", "Assignment", "GroupMembership", "StudentGroup", "Student", "Classroom" CASCADE;
    `)
  })

  afterAll(async () => {
    if (app) await app.close()
    if (databaseServer) await databaseServer.stop()
    if (database) await database.close()
    for (const key of ['DEMO_ADMIN_TOKEN', 'DATABASE_URL', 'DB_POOL_MAX', 'PUBLIC_WEB_URL', 'STORAGE_DRIVER', 'UPLOAD_DIR']) delete process.env[key]
  }, 30000)

  it('records a reversible offline completion and generates the missing names', async () => {
    const setup = await call('/demo/bootstrap', { method: 'POST', body: JSON.stringify({ className: '四年级二班' }) })
    const classId = setup.body.data.id as string
    const imported = await call(`/classes/${classId}/students`, { method: 'PUT', body: JSON.stringify({ students: [
      { studentNo: '4001', name: '甲同学' }, { studentNo: '4002', name: '乙同学' }, { studentNo: '4003', name: '丙同学' },
    ] }) })
    expect(imported.body.data.created).toBe(3)
    const roster = await call(`/classes/${classId}/students?pageSize=10`)
    const students = roster.body.data.items as Array<{ id: string; name: string }>

    const create = await call('/assignments', { method: 'POST', body: JSON.stringify({ title: '实验课带齐材料', type: 'offline', target: { mode: 'all' }, publishNow: true }) })
    const assignmentId = create.body.data.id as string
    const completion = await call(`/assignments/${assignmentId}/completions/${students[0].id}`, { method: 'PUT', body: JSON.stringify({ completed: true }) })
    expect(completion.body.data.completed).toBe(true)
    const dashboard = await call(`/assignments/${assignmentId}/dashboard`)
    expect(dashboard.body.data.summary).toMatchObject({ expected: 3, submitted: 1, missing: 2 })
    expect(dashboard.body.data.missingMentionText).toBe('@乙同学 @丙同学')
    await call(`/assignments/${assignmentId}/completions/${students[0].id}`, { method: 'PUT', body: JSON.stringify({ completed: false }) })
    const reversed = await call(`/assignments/${assignmentId}/dashboard`)
    expect(reversed.body.data.summary.missing).toBe(3)
  }, 30000)

  it('makes repeated check-in idempotent and rejects ambiguous names', async () => {
    const setup = await call('/demo/bootstrap', { method: 'POST', body: JSON.stringify({ className: '五年级一班' }) })
    const classId = setup.body.data.id as string
    const imported = await call(`/classes/${classId}/students`, { method: 'PUT', body: JSON.stringify({ students: [
      { studentNo: '5001', name: '李同学' }, { studentNo: '5002', name: '李同学' }, { studentNo: '5003', name: '张同学' },
    ] }) })
    expect(imported.body.data.created).toBe(3)
    const created = await call('/assignments', { method: 'POST', body: JSON.stringify({ title: '周一早读签到', type: 'checkin', target: { mode: 'all' }, publishNow: true }) })
    const shareCode = created.body.data.shareCode as string

    const ambiguous = await call(`/public/assignments/${shareCode}/check-ins`, { method: 'POST', body: JSON.stringify({ studentName: '李同学' }) })
    expect(ambiguous.response.status).toBe(400)
    const checkIn = await call(`/public/assignments/${shareCode}/check-ins`, { method: 'POST', body: JSON.stringify({ studentNo: '5001', studentName: '李同学' }) })
    expect(checkIn.body.data.alreadyCheckedIn).toBe(false)
    const repeated = await call(`/public/assignments/${shareCode}/check-ins`, { method: 'POST', body: JSON.stringify({ studentNo: '5001', studentName: '李同学' }) })
    expect(repeated.body.data.alreadyCheckedIn).toBe(true)
    const dashboard = await call(`/assignments/${created.body.data.id}/dashboard`)
    expect(dashboard.body.data.summary).toMatchObject({ expected: 3, submitted: 1, missing: 2 })
  }, 30000)

  it('assigns relay positions once and rejects duplicate entries', async () => {
    const setup = await call('/demo/bootstrap', { method: 'POST', body: JSON.stringify({ className: '六年级三班' }) })
    const classId = setup.body.data.id as string
    const imported = await call(`/classes/${classId}/students`, { method: 'PUT', body: JSON.stringify({ students: [
      { studentNo: '6001', name: '王一' }, { studentNo: '6002', name: '王二' }, { studentNo: '6003', name: '王三' },
    ] }) })
    expect(imported.body.data.created).toBe(3)
    const created = await call('/assignments', { method: 'POST', body: JSON.stringify({ title: '周末阅读接龙', type: 'relay', target: { mode: 'all' }, publishNow: true }) })
    const shareCode = created.body.data.shareCode as string

    const first = await call(`/public/assignments/${shareCode}/relay-entries`, { method: 'POST', body: JSON.stringify({ studentNo: '6001', studentName: '王一', content: '《西游记》' }) })
    const second = await call(`/public/assignments/${shareCode}/relay-entries`, { method: 'POST', body: JSON.stringify({ studentNo: '6002', studentName: '王二' }) })
    expect(first.body.data.position).toBe(1)
    expect(second.body.data.position).toBe(2)
    const duplicate = await call(`/public/assignments/${shareCode}/relay-entries`, { method: 'POST', body: JSON.stringify({ studentNo: '6001', studentName: '王一' }) })
    expect(duplicate.response.status).toBe(409)
    const dashboard = await call(`/assignments/${created.body.data.id}/dashboard`)
    expect(dashboard.body.data.summary).toMatchObject({ expected: 3, submitted: 2, missing: 1 })
    expect(dashboard.body.data.missingMentionText).toBe('@王三')
  }, 30000)

  it('freezes a selected audience and stops public actions after closing', async () => {
    const setup = await call('/demo/bootstrap', { method: 'POST', body: JSON.stringify({ className: '七年级一班' }) })
    const classId = setup.body.data.id as string
    await call(`/classes/${classId}/students`, { method: 'PUT', body: JSON.stringify({ students: [
      { studentNo: '7001', name: '赵一' }, { studentNo: '7002', name: '钱二' }, { studentNo: '7003', name: '孙三' },
    ] }) })
    const roster = await call(`/classes/${classId}/students?pageSize=10`)
    const students = roster.body.data.items as Array<{ id: string }>
    const created = await call('/assignments', {
      method: 'POST',
      body: JSON.stringify({
        title: '定向签到', type: 'checkin', publishNow: true,
        target: { mode: 'students', studentIds: [students[0].id, students[1].id] },
      }),
    })
    expect(created.body.data.expectedCount).toBe(2)
    const shareCode = created.body.data.shareCode as string

    const outsider = await call(`/public/assignments/${shareCode}/check-ins`, {
      method: 'POST', body: JSON.stringify({ studentNo: '7003', studentName: '孙三' }),
    })
    expect(outsider.response.status).toBe(400)
    const insider = await call(`/public/assignments/${shareCode}/check-ins`, {
      method: 'POST', body: JSON.stringify({ studentNo: '7001', studentName: '赵一' }),
    })
    expect(insider.response.status).toBe(201)
    const dashboard = await call(`/assignments/${created.body.data.id}/dashboard`)
    expect(dashboard.body.data.summary).toMatchObject({ expected: 2, submitted: 1, missing: 1 })

    const closed = await call(`/assignments/${created.body.data.id}/state`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) })
    expect(closed.response.status).toBe(200)
    const afterClose = await call(`/public/assignments/${shareCode}/check-ins`, {
      method: 'POST', body: JSON.stringify({ studentNo: '7002', studentName: '钱二' }),
    })
    expect(afterClose.response.status).toBe(404)
  }, 30000)
})
