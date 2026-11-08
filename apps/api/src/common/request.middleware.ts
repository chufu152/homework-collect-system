import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const requestId = randomUUID()
  response.setHeader('X-Request-Id', requestId)
  ;(request as Request & { requestId: string }).requestId = requestId
  next()
}
