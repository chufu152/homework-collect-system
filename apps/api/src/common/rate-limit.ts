export interface RateLimitConfig {
  enabled: boolean
  windowMs: number
  publicMax: number
  adminMax: number
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/** Env is read when the app is created, so tests can configure a tiny window. */
export function readRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  return {
    enabled: (env.RATE_LIMIT_ENABLED ?? 'true') !== 'false',
    windowMs: positiveInteger(env.RATE_LIMIT_WINDOW_MS, 60000),
    // Behind nginx every visitor shares the proxy's address, so the public
    // bucket is deliberately generous; it still caps bursts and brute force.
    publicMax: positiveInteger(env.RATE_LIMIT_PUBLIC_MAX, 600),
    adminMax: positiveInteger(env.RATE_LIMIT_ADMIN_MAX, 300),
  }
}

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

/**
 * Small in-process sliding-window limiter. The demo runs as a single API
 * instance; a shared store (Redis) is only needed once it is scaled out.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(private readonly windowMs: number, private readonly max: number) {}

  consume(key: string, now = Date.now()): RateLimitDecision {
    const cutoff = now - this.windowMs
    const timestamps = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff)
    if (timestamps.length >= this.max) {
      this.hits.set(key, timestamps)
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((timestamps[0] + this.windowMs - now) / 1000)),
        remaining: 0,
      }
    }
    timestamps.push(now)
    this.hits.set(key, timestamps)
    this.sweep(cutoff)
    return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, this.max - timestamps.length) }
  }

  /** Bound memory usage when many distinct client addresses are seen. */
  private sweep(cutoff: number): void {
    if (this.hits.size <= 10000) return
    for (const [key, timestamps] of this.hits) {
      const active = timestamps.filter((timestamp) => timestamp > cutoff)
      if (active.length) this.hits.set(key, active)
      else this.hits.delete(key)
    }
  }
}
