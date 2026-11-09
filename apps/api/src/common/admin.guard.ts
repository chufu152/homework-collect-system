import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { isConfiguredAdminToken, isValidAdminToken } from './admin-token.js'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isConfiguredAdminToken()) {
      throw new ServiceUnavailableException('Set a private DEMO_ADMIN_TOKEN in the API environment before using teacher controls.')
    }

    const request = context.switchToHttp().getRequest<Request>()
    const supplied = request.header('x-demo-admin-token') ?? ''
    if (!isValidAdminToken(supplied)) {
      throw new UnauthorizedException('A valid teacher key is required.')
    }
    return true
  }
}
