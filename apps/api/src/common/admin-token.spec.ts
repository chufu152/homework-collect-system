import { afterEach, describe, expect, it } from 'vitest'
import { compareSecrets, isConfiguredAdminToken, isValidAdminToken } from './admin-token.js'

const validToken = 'a-private-class-key-with-32-byte-minimum'

afterEach(() => {
  delete process.env.DEMO_ADMIN_TOKEN
})

describe('central teacher credential rules', () => {
  it('rejects missing, short and placeholder secrets everywhere', () => {
    expect(isConfiguredAdminToken()).toBe(false)
    for (const value of ['short', 'replace-with-a-random-secret-at-least-32-characters-long', 'generate-a-random-token-before-running']) {
      process.env.DEMO_ADMIN_TOKEN = value
      expect(isConfiguredAdminToken()).toBe(false)
      expect(isValidAdminToken(value)).toBe(false)
    }
  })

  it('accepts only an exact match and never a prefix', () => {
    process.env.DEMO_ADMIN_TOKEN = validToken
    expect(isConfiguredAdminToken()).toBe(true)
    expect(isValidAdminToken(validToken)).toBe(true)
    expect(isValidAdminToken(validToken.slice(0, -1))).toBe(false)
    expect(isValidAdminToken(undefined)).toBe(false)
  })

  it('compares arbitrary capability codes in constant time', () => {
    expect(compareSecrets('same-value', 'same-value')).toBe(true)
    expect(compareSecrets('same-value', 'other-value')).toBe(false)
    expect(compareSecrets(undefined, 'same-value')).toBe(false)
    expect(compareSecrets('same-value', undefined)).toBe(false)
  })
})
