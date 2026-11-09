import { timingSafeEqual } from 'node:crypto'

/**
 * Demo deployments use a single static teacher key. Keeping the "is it usable"
 * and "does it match" rules in one place prevents the guarded controllers and
 * the unguarded file-download controller from disagreeing about what counts as
 * a valid credential.
 */
export const MIN_ADMIN_TOKEN_LENGTH = 32
const PLACEHOLDER_TOKEN = /^(generate-|replace-with|change-me|your-)/i

export function isConfiguredAdminToken(): boolean {
  const expected = process.env.DEMO_ADMIN_TOKEN
  return Boolean(expected)
    && expected!.length >= MIN_ADMIN_TOKEN_LENGTH
    && !PLACEHOLDER_TOKEN.test(expected!)
}

/** Constant-time comparison that also rejects missing/placeholder secrets. */
export function compareSecrets(supplied: string | undefined, expected: string | undefined): boolean {
  if (!supplied || !expected) return false
  const left = Buffer.from(expected)
  const right = Buffer.from(supplied)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function isValidAdminToken(value?: string): boolean {
  return isConfiguredAdminToken() && compareSecrets(value, process.env.DEMO_ADMIN_TOKEN)
}
