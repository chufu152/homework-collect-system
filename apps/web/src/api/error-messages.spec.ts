import { describe, expect, it } from 'vitest'

import { describeError } from './error-messages'

// 与 apps/web/src/api/client.ts 的 ApiRequestError 结构一致；此处不依赖该模块，
// 以便组件测试的 vi.mock('../api/client') 不影响文案映射的判定。
class FakeApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryAfter: number | null = null,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

const SERVER_MESSAGE = 'Assignment not found.'

describe('B2 error copy', () => {
  it('explains rate limiting with the Retry-After delay', () => {
    const text = describeError(new FakeApiError('Too many requests.', 'RATE_LIMITED', 429, 30), '兜底')
    expect(text).toContain('操作太频繁')
    expect(text).toContain('约 30 秒后重试')
  })

  it('still offers a recovery action when Retry-After is absent', () => {
    const text = describeError(new FakeApiError('Too many requests.', 'RATE_LIMITED', 429), '兜底')
    expect(text).toContain('请稍等片刻再重试')
  })

  it('explains oversized uploads and how to recover', () => {
    const text = describeError(new FakeApiError('File too large.', 'FILE_TOO_LARGE', 413), '兜底')
    expect(text).toContain('超出大小上限')
    expect(text).toContain('减小文件')
    expect(text).toContain('分批导出')
  })

  it('explains an unavailable service without inventing a cause', () => {
    const text = describeError(new FakeApiError('Service unavailable.', 'SERVICE_UNAVAILABLE', 503), '兜底')
    expect(text).toContain('服务暂时不可用')
    expect(text).toContain('联系教师')
  })

  it('keeps the unified envelope message for the remaining codes and adds a recovery action', () => {
    const cases: Array<[string, number, string]> = [
      ['VALIDATION_ERROR', 400, '请核对信息后重试'],
      ['BAD_REQUEST', 400, '请核对信息后重试'],
      ['UNAUTHORIZED', 401, '重新保存管理密钥'],
      ['FORBIDDEN', 403, '教师入口'],
      ['NOT_FOUND', 404, '分享链接或回执链接'],
      ['CONFLICT', 409, '刷新页面'],
      ['INTERNAL_ERROR', 500, '稍后重试'],
      ['VALIDATION_ERROR', 422, '请核对信息后重试'],
    ]
    for (const [code, status, recovery] of cases) {
      const text = describeError(new FakeApiError(SERVER_MESSAGE, code, status), '兜底')
      expect(text).toContain(SERVER_MESSAGE)
      expect(text).toContain(recovery)
      expect(text).toContain('。')
    }
  })

  it('never renders an undefined problem label for a message-less envelope error', () => {
    const text = describeError(new FakeApiError('', 'NOT_FOUND', 404), '兜底')
    expect(text).toContain('未找到对应的作业、提交或文件')
    expect(text).not.toContain('undefined')
  })

  it('preserves client-side download/export messages unchanged', () => {
    const download = '附件暂时无法下载，请稍后重试；若持续失败，请联系教师。'
    const exportText = '导出暂时失败，请稍后重试；若持续失败，请联系教师。'
    expect(describeError(new FakeApiError(download, 'DOWNLOAD_FAILED', 502), '兜底')).toBe(download)
    expect(describeError(new FakeApiError(exportText, 'EXPORT_FAILED', 500), '兜底')).toBe(exportText)
  })

  it('localizes browser network failures and offers a recovery action', () => {
    const text = describeError(new TypeError('Failed to fetch'), '兜底')
    expect(text).toContain('网络连接失败')
    expect(text).toContain('检查网络后重试')
  })

  it('preserves ordinary errors and uses the caller fallback otherwise', () => {
    expect(describeError(new Error('历次修改暂时无法读取'), '兜底')).toBe('历次修改暂时无法读取')
    expect(describeError(null, '回执暂时无法读取。')).toBe('回执暂时无法读取。')
  })
})
