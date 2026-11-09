import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateAssignmentDto, SubmitDto } from './assignments.dto.js'

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

describe('multipart submission validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  const metadata = { type: 'body', metatype: SubmitDto } as never

  it('accepts the fields sent by the student form', async () => {
    const value = await pipe.transform({ studentNo: '2026001', studentName: '张三', textContent: '答案：42' }, metadata)
    expect(value).toBeInstanceOf(SubmitDto)
    expect((value as SubmitDto).textContent).toBe('答案：42')
  })

  it('rejects oversized text and non-string form fields instead of letting them crash the service', async () => {
    await expect(pipe.transform({ textContent: 'x'.repeat(20001) }, metadata)).rejects.toThrow()
    await expect(pipe.transform({ studentNo: { evil: true } }, metadata)).rejects.toThrow()
    await expect(pipe.transform({ unexpectedField: true }, metadata)).rejects.toThrow()
  })
})
