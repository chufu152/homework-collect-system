import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRateLimitConfig, SlidingWindowLimiter } from './rate-limit.js'
import { bucketForPath, createRateLimitMiddleware, isRateLimitExempt } from './rate-limit.middleware.js'

function requestFor(path: string, ip = '127.0.0.1') {
  return {
    originalUrl: path,
    path,
    ip,
    socket: { remoteAddress: ip },
    requestId: 'request-1',
  } as never
}

function responseSpy() {
  const headers: Record<string, string> = {}
  const response = {
    setHeader: vi.fn((name: string, value: string) => { headers[name] = value }),
    status: vi.fn(),
    json: vi.fn(),
    headers,
  }
  response.status.mockReturnValue(response)
  response.json.mockReturnValue(response)
  return response
}

afterEach(() => {
  for (const key of ['RATE_LIMIT_ENABLED', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_PUBLIC_MAX', 'RATE_LIMIT_ADMIN_MAX']) delete process.env[key]
})

describe('sliding window rate limiter', () => {
  it('blocks after the limit and frees a slot once the window elapses', () => {
    const limiter = new SlidingWindowLimiter(1000, 2)
    expect(limiter.consume('public:ip', 0).allowed).toBe(true)
    expect(limiter.consume('public:ip', 100).allowed).toBe(true)
    const blocked = limiter.consume('public:ip', 200)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(1)
    expect(limiter.consume('public:ip', 1001).allowed).toBe(true)
  })

  it('keeps separate counters per client and reads sane defaults from env', () => {
    const limiter = new SlidingWindowLimiter(1000, 1)
    expect(limiter.consume('a', 0).allowed).toBe(true)
    expect(limiter.consume('b', 0).allowed).toBe(true)
    expect(limiter.consume('a', 0).allowed).toBe(false)
    expect(readRateLimitConfig({})).toMatchObject({ enabled: true, windowMs: 60000, publicMax: 600, adminMax: 300 })
  })
})

describe('rate limit middleware', () => {
  it('classifies capability routes and exempts the readiness probe', () => {
    expect(bucketForPath('/api/v1/public/assignments/abc')).toBe('public')
    expect(bucketForPath('/api/v1/files/file-1/download')).toBe('public')
    expect(bucketForPath('/api/v1/assignments')).toBe('admin')
    expect(isRateLimitExempt('/api/v1/health')).toBe(true)
  })

  it('answers 429 with the standard envelope and Retry-After', () => {
    process.env.RATE_LIMIT_PUBLIC_MAX = '1'
    const middleware = createRateLimitMiddleware()
    const next = vi.fn()
    const first = responseSpy()
    middleware(requestFor('/api/v1/public/assignments/abc'), first as never, next)
    expect(next).toHaveBeenCalledOnce()

    const second = responseSpy()
    middleware(requestFor('/api/v1/public/assignments/abc'), second as never, next)
    expect(next).toHaveBeenCalledOnce()
    expect(second.status).toHaveBeenCalledWith(429)
    expect(second.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED', requestId: 'request-1' }))
    expect(second.headers['Retry-After']).toBeDefined()
  })

  it('can be disabled and never throttles health checks', () => {
    process.env.RATE_LIMIT_ENABLED = 'false'
    process.env.RATE_LIMIT_PUBLIC_MAX = '1'
    const middleware = createRateLimitMiddleware()
    const next = vi.fn()
    for (let index = 0; index < 3; index += 1) {
      middleware(requestFor('/api/v1/public/assignments/abc'), responseSpy() as never, next)
    }
    expect(next).toHaveBeenCalledTimes(3)

    process.env.RATE_LIMIT_ENABLED = 'true'
    const enabled = createRateLimitMiddleware()
    const healthNext = vi.fn()
    for (let index = 0; index < 3; index += 1) {
      enabled(requestFor('/api/v1/health'), responseSpy() as never, healthNext)
    }
    expect(healthNext).toHaveBeenCalledTimes(3)
  })
})
