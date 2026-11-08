import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.DEMO_ADMIN_TOKEN
    if (!expected || expected.length < 32 || /^(generate-|replace-with|change-me|your-)/i.test(expected)) {
      throw new ServiceUnavailableException('Set a private DEMO_ADMIN_TOKEN in the API environment before using teacher controls.')
    }

    const request = context.switchToHttp().getRequest<Request>()
    const supplied = request.header('x-demo-admin-token') ?? ''
    const expectedBuffer = Buffer.from(expected)
    const suppliedBuffer = Buffer.from(supplied)
    if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      throw new UnauthorizedException('A valid teacher key is required.')
    }
    return true
  }
}
