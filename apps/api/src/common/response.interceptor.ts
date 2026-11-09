import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { map, Observable } from 'rxjs'
import type { Request, Response } from 'express'

/**
 * Every JSON endpoint shares the same envelope. `null` payloads (for example
 * `GET /classes/current` before bootstrap) are wrapped too: returning a bare
 * `null` makes Nest send an empty body, which clients cannot parse as JSON.
 *
 * Handlers that own the Express response (`@Res()` file downloads / exports)
 * have already sent headers by the time the interceptor runs, so their result
 * is passed through untouched.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<Request & { requestId?: string }>()
    const response = http.getResponse<Response>()
    return next.handle().pipe(
      map((data: unknown) => {
        if (response.headersSent || response.writableEnded) return data
        return {
          code: 'OK',
          message: 'ok',
          data: data ?? null,
          requestId: request.requestId ?? '',
        }
      }),
    )
  }
}
