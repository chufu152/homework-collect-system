import { readFileSync, readdirSync } from 'node:fs'

/**
 * Loads the exact SQL that `prisma migrate deploy` applies, in migration order.
 * The E2E suites execute this against PGlite, so tests exercise the production
 * schema (enums, indexes, foreign keys) instead of a hand-maintained DDL copy.
 */
export function loadMigrationSql(): string {
  const migrationsDir = new URL('../prisma/migrations/', import.meta.url)
  const names = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  if (names.length === 0) {
    throw new Error('No Prisma migrations found under apps/api/prisma/migrations.')
  }

  return names
    .map((name) => {
      const sql = readFileSync(new URL(`${name}/migration.sql`, migrationsDir), 'utf8')
      return `-- === ${name} ===\n${sql.trim()}\n`
    })
    .join('\n')
}
