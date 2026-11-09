import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { HealthController } from './health.controller.js'

describe('readiness probe', () => {
  it('reports ok only when the database answers', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ one: 1 }]) }
    await expect(new HealthController(prisma as never).check()).resolves.toEqual({ status: 'ok' })
    expect(prisma.$queryRaw).toHaveBeenCalledOnce()
  })

  it('fails readiness instead of claiming a healthy process with a broken database', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) }
    await expect(new HealthController(prisma as never).check()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
