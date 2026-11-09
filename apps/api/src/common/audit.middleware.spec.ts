import { Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { auditMiddleware, formatAuditEntry, redactRoutePath } from './audit.middleware.js'

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.AUDIT_LOG_ENABLED
})

describe('operation audit trail', () => {
  it('never writes capability tokens into the route field', () => {
    const redacted = redactRoutePath('/api/v1/public/assignments/YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo/submissions')
    expect(redacted).not.toContain('YWJj')
    expect(redacted).toContain(':token')
  })

  it('labels student, teacher and system actors by route', () => {
    expect(formatAuditEntry({ method: 'POST', path: '/api/v1/public/assignments/x/check-ins', status: 201, durationMs: 5 }).actor).toBe('student')
    expect(formatAuditEntry({ method: 'PATCH', path: '/api/v1/submissions/x/feedback', status: 200, durationMs: 5 }).actor).toBe('teacher')
    expect(formatAuditEntry({ method: 'GET', path: '/api/v1/health', status: 200, durationMs: 5 }).actor).toBe('system')
  })

  it('emits one structured entry after the response finishes', () => {
    const log = vi.spyOn(Logger, 'log').mockImplementation(() => {})
    let finish: (() => void) | undefined
    const response = {
      statusCode: 404,
      on: vi.fn((event: string, callback: () => void) => { if (event === 'finish') finish = callback }),
    }
    const next = vi.fn()
    auditMiddleware(
      { method: 'GET', originalUrl: '/api/v1/public/submissions/abcdefghijklmnopqrstuvwx', path: '/public/submissions/abcdefghijklmnopqrstuvwx', requestId: 'r-1' } as never,
      response as never,
      next,
    )
    expect(next).toHaveBeenCalledOnce()
    finish?.()
    expect(log).toHaveBeenCalledOnce()
    const entry = JSON.parse(log.mock.calls[0][0] as string)
    expect(entry).toMatchObject({ requestId: 'r-1', method: 'GET', actor: 'student', status: 404 })
    expect(entry.route).not.toContain('abcdefghijklmnopqrstuvwx')
  })

  it('can be switched off explicitly', () => {
    process.env.AUDIT_LOG_ENABLED = 'false'
    const log = vi.spyOn(Logger, 'log').mockImplementation(() => {})
    let finish: (() => void) | undefined
    const response = {
      statusCode: 200,
      on: vi.fn((event: string, callback: () => void) => { if (event === 'finish') finish = callback }),
    }
    auditMiddleware({ method: 'GET', originalUrl: '/api/v1/health', path: '/health' } as never, response as never, vi.fn())
    finish?.()
    expect(log).not.toHaveBeenCalled()
  })
})
