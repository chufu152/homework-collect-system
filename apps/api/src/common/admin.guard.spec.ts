import { afterEach, describe, expect, it } from 'vitest'
import { AdminGuard } from './admin.guard.js'

function executionContext(token?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => name.toLowerCase() === 'x-demo-admin-token' ? token : undefined }),
    }),
  } as never
}

afterEach(() => {
  delete process.env.DEMO_ADMIN_TOKEN
})

describe('teacher management guard', () => {
  it('refuses management access until a private token is configured', () => {
    expect(() => new AdminGuard().canActivate(executionContext('anything'))).toThrow('Set a private DEMO_ADMIN_TOKEN')
  })

  it('refuses example placeholders and secrets shorter than 32 characters', () => {
    process.env.DEMO_ADMIN_TOKEN = 'replace-with-a-long-random-secret'
    expect(() => new AdminGuard().canActivate(executionContext('replace-with-a-long-random-secret')))
      .toThrow('Set a private DEMO_ADMIN_TOKEN')
    process.env.DEMO_ADMIN_TOKEN = 'short'
    expect(() => new AdminGuard().canActivate(executionContext('short')))
      .toThrow('Set a private DEMO_ADMIN_TOKEN')
  })

  it('rejects missing and incorrect tokens and accepts the configured token', () => {
    process.env.DEMO_ADMIN_TOKEN = 'a-private-class-key-with-32-byte-minimum'
    const guard = new AdminGuard()
    expect(() => guard.canActivate(executionContext())).toThrow('A valid teacher key is required.')
    expect(() => guard.canActivate(executionContext('wrong-key'))).toThrow('A valid teacher key is required.')
    expect(guard.canActivate(executionContext('a-private-class-key-with-32-byte-minimum'))).toBe(true)
  })
})
