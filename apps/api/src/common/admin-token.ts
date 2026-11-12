import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * 教师密钥体系：每个班级持有独立的密钥（数据库只存 SHA-256 哈希）。
 * - `hashTeacherKey` / `keyMatchesHash` 服务于按班级校验；
 * - 旧的单密钥（DEMO_ADMIN_TOKEN）仅作为「迁移前历史班级（teacherKeyHash 为空）」的回退校验，
 *   保证存量部署平滑过渡。
 */
export const MIN_ADMIN_TOKEN_LENGTH = 32
export const MIN_CLASS_KEY_LENGTH = 8
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

export function hashTeacherKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex')
}

/** 班级密钥的格式校验：去空格后至少 8 个字符，且不是占位符样式。 */
export function isValidTeacherKeyFormat(key: string | undefined): boolean {
  const trimmed = key?.trim()
  return Boolean(trimmed)
    && trimmed!.length >= MIN_CLASS_KEY_LENGTH
    && !PLACEHOLDER_TOKEN.test(trimmed!)
}

/** 常数时间比较「提交的密钥」与「班级存储的哈希」。 */
export function keyMatchesHash(key: string | undefined, hash: string): boolean {
  if (!key?.trim() || !hash) return false
  const digest = Buffer.from(hashTeacherKey(key.trim()))
  const expected = Buffer.from(hash)
  return digest.length === expected.length && timingSafeEqual(digest, expected)
}
