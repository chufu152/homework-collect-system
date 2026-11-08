import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Request, Response } from 'express'

@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<Request & { requestId?: string }>()
    const response = context.getResponse<Response>()
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    if (!(exception instanceof HttpException)) Logger.error('Unhandled request exception', exception instanceof Error ? exception.stack : String(exception), HttpExceptionEnvelopeFilter.name)
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null
    const message = typeof exceptionResponse === 'string'
      ? exceptionResponse
      : exceptionResponse && typeof exceptionResponse === 'object' && 'message' in exceptionResponse
        ? (exceptionResponse as { message: string | string[] }).message
        : 'The request could not be completed.'
    const validationMessages = Array.isArray(message) ? message : []
    const code = status === 401 ? 'UNAUTHORIZED'
      : status === 403 ? 'FORBIDDEN'
        : status === 404 ? 'NOT_FOUND'
          : status === 409 ? 'CONFLICT'
            : status === 413 ? 'FILE_TOO_LARGE'
              : status === 422 ? 'VALIDATION_ERROR'
                : status === 503 ? 'SERVICE_UNAVAILABLE'
                  : status === 400 ? validationMessages.length ? 'VALIDATION_ERROR' : 'BAD_REQUEST'
                    : 'INTERNAL_ERROR'

    response.status(status).json({
      code,
      message: validationMessages.length ? 'Request validation failed.' : message,
      details: validationMessages.map((reason) => ({ reason })),
      requestId: request.requestId ?? '',
    })
  }
}
