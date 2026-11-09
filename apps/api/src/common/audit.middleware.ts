import { Logger } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

export interface AuditEntry {
  requestId: string
  method: string
  route: string
  actor: 'student' | 'teacher' | 'system'
  status: number
  durationMs: number
}

/** Never log raw URLs: they carry shareCode / receiptCode capability tokens. */
export function redactRoutePath(path: string): string {
  return path.replace(/[A-Za-z0-9_-]{16,}/g, ':token')
}

export function formatAuditEntry(input: {
  requestId?: string
  method: string
  path: string
  route?: string
  status: number
  durationMs: number
}): AuditEntry {
  const actor: AuditEntry['actor'] = input.path.includes('/health') ? 'system'
    : input.path.includes('/public/') || input.path.startsWith('/api/v1/files/') ? 'student'
      : 'teacher'
  return {
    requestId: input.requestId ?? '',
    method: input.method,
    route: input.route ?? redactRoutePath(input.path),
    actor,
    status: input.status,
    durationMs: input.durationMs,
  }
}

/**
 * Writes one structured line per completed request. This is the demo's
 * operation audit trail: it records who acted on which route and the outcome,
 * without persisting student data or the teacher key.
 */
export function auditMiddleware(request: Request & { requestId?: string }, response: Response, next: NextFunction): void {
  const started = Date.now()
  response.on('finish', () => {
    if (process.env.AUDIT_LOG_ENABLED === 'false') return
    const route = (request as Request & { route?: { path?: string } }).route?.path
    const path = (request.originalUrl || request.path).split('?')[0]
    Logger.log(JSON.stringify(formatAuditEntry({
      requestId: request.requestId,
      method: request.method,
      path,
      route,
      status: response.statusCode,
      durationMs: Date.now() - started,
    })), 'Audit')
  })
  next()
}
