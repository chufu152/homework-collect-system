import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Request, Response } from 'express'

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'FILE_TOO_LARGE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
  500: 'INTERNAL_ERROR',
}

function isMulterLimitError(exception: unknown): boolean {
  if (!(exception instanceof Error) || exception.name !== 'MulterError') return false
  const code = (exception as { code?: unknown }).code
  return typeof code === 'string' && code.startsWith('LIMIT_')
}

@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<Request & { requestId?: string }>()
    const response = context.getResponse<Response>()
    const uploadLimit = isMulterLimitError(exception)
    const status = uploadLimit
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    if (!(exception instanceof HttpException) && !uploadLimit) {
      Logger.error('Unhandled request exception', exception instanceof Error ? exception.stack : String(exception), HttpExceptionEnvelopeFilter.name)
    }
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null
    const message = uploadLimit
      ? 'Uploaded files exceed the configured size or count limit.'
      : typeof exceptionResponse === 'string'
        ? exceptionResponse
        : exceptionResponse && typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? (exceptionResponse as { message: string | string[] }).message
          : 'The request could not be completed.'
    const validationMessages = Array.isArray(message) ? message : []
    const code = CODE_BY_STATUS[status] ?? 'INTERNAL_ERROR'
    const validationCode = status === 400 && validationMessages.length ? 'VALIDATION_ERROR' : code

    response.status(status).json({
      code: validationCode,
      message: validationMessages.length ? 'Request validation failed.' : message,
      details: validationMessages.map((reason) => ({ reason })),
      requestId: request.requestId ?? '',
    })
  }
}
