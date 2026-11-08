import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { map, Observable } from 'rxjs'
import type { Request } from 'express'

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { requestId?: string }>()
    return next.handle().pipe(
      map((data: unknown) => {
        if (data === undefined || data === null) return data
        return {
          code: 'OK',
          message: 'ok',
          data,
          requestId: request.requestId ?? '',
        }
      }),
    )
  }
}
