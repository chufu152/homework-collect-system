import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { firstValueFrom, of } from 'rxjs'
import { ResponseInterceptor } from './response.interceptor.js'

function contextFor(request: Record<string, unknown>, response: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext
}

function handlerReturning(value: unknown): CallHandler {
  return { handle: () => of(value) }
}

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor()

  it('wraps a normal payload in the shared envelope', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      contextFor({ requestId: 'req-1' }, { headersSent: false, writableEnded: false }),
      handlerReturning({ id: 'class-1' }),
    ))
    expect(result).toEqual({
      code: 'OK',
      message: 'ok',
      data: { id: 'class-1' },
      requestId: 'req-1',
    })
  })

  it('wraps a null payload as JSON data:null instead of an empty body', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      contextFor({}, { headersSent: false, writableEnded: false }),
      handlerReturning(null),
    ))
    expect(result).toEqual({ code: 'OK', message: 'ok', data: null, requestId: '' })
  })

  it('wraps an undefined payload as JSON data:null', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      contextFor({}, { headersSent: false, writableEnded: false }),
      handlerReturning(undefined),
    ))
    expect(result).toMatchObject({ code: 'OK', data: null })
  })

  it('leaves @Res() download handlers untouched once headers are sent', async () => {
    const raw = { notAnEnvelope: true }
    const result = await firstValueFrom(interceptor.intercept(
      contextFor({}, { headersSent: true, writableEnded: false }),
      handlerReturning(raw),
    ))
    expect(result).toBe(raw)
  })
})
