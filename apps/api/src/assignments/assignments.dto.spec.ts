import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateAssignmentDto } from './assignments.dto.js'

async function validateAssignment(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreateAssignmentDto, {
    title: '课堂练习',
    type: 'online',
    target: { mode: 'all' },
    ...overrides,
  })
  return validate(dto)
}

describe('assignment request validation', () => {
  it('accepts the configured upload limit in megabytes and an RFC3339 deadline', async () => {
    const errors = await validateAssignment({ maxFileSizeMB: 20, dueAt: '2026-11-12T12:00:00Z' })
    expect(errors).toEqual([])
  })

  it('rejects an upload limit expressed as a byte count', async () => {
    const errors = await validateAssignment({ maxFileSizeMB: 20971520 })
    expect(errors.some((error) => error.property === 'maxFileSizeMB')).toBe(true)
  })

  it('rejects arbitrary upload extensions before creating a public assignment', async () => {
    const errors = await validateAssignment({ allowedFileTypes: ['pdf', 'exe'] })
    expect(errors.some((error) => error.property === 'allowedFileTypes')).toBe(true)
  })
})
