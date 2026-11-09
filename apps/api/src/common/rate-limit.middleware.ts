import type { NextFunction, Request, Response } from 'express'
import { readRateLimitConfig, SlidingWindowLimiter } from './rate-limit.js'

type RequestWithId = Request & { requestId?: string }

/** `req.path` is relative to the mount point; the original URL is not. */
function requestPath(request: Request): string {
  return (request.originalUrl || request.path).split('?')[0]
}

export type RateLimitBucket = 'public' | 'admin'

/** Capability-link routes share a stricter bucket than teacher routes. */
export function bucketForPath(path: string): RateLimitBucket {
  return path.includes('/public/') || path.startsWith('/api/v1/files/') ? 'public' : 'admin'
}

export function isRateLimitExempt(path: string): boolean {
  return path === '/api/v1/health'
}

export function createRateLimitMiddleware() {
  const config = readRateLimitConfig()
  const limiters: Record<RateLimitBucket, SlidingWindowLimiter> = {
    public: new SlidingWindowLimiter(config.windowMs, config.publicMax),
    admin: new SlidingWindowLimiter(config.windowMs, config.adminMax),
  }

  return function rateLimitMiddleware(request: RequestWithId, response: Response, next: NextFunction): void {
    const path = requestPath(request)
    if (!config.enabled || isRateLimitExempt(path)) {
      next()
      return
    }
    const bucket = bucketForPath(path)
    const client = request.ip ?? request.socket.remoteAddress ?? 'unknown'
    const decision = limiters[bucket].consume(`${bucket}:${client}`)
    if (!decision.allowed) {
      response.setHeader('Retry-After', String(decision.retryAfterSeconds))
      response.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please retry later.',
        details: [],
        requestId: request.requestId ?? '',
      })
      return
    }
    response.setHeader('X-RateLimit-Remaining', String(decision.remaining))
    next()
  }
}
