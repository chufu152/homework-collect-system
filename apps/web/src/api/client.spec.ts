import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('API client response boundaries', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('keeps a documented data:null envelope distinct from an empty response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 'OK', message: 'ok', data: null, requestId: 'req-1' })))

    await expect(api.currentClass()).resolves.toBeNull()
  })

  it('rejects a successful JSON response without the data field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 'OK', message: 'ok', requestId: 'req-2' })))

    await expect(api.currentClass()).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'INVALID_ENVELOPE',
      status: 200,
    })
  })

  it('rejects an empty JSON response body instead of treating it as an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    await expect(api.currentClass()).rejects.toMatchObject({ code: 'INVALID_ENVELOPE', status: 200 })
  })

  it('preserves a non-empty binary response as a Blob', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    })))

    const result = await api.request<Blob>('/binary')
    expect(result).toMatchObject({ size: 3, type: 'application/octet-stream' })
  })

  it('rejects an empty binary response as missing file data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    })))

    await expect(api.request<Blob>('/binary')).rejects.toMatchObject({ code: 'EMPTY_RESPONSE', status: 200 })
  })

  it('does not trigger a download for an empty attachment Blob', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })))

    await expect(api.download('file-1', 'receipt-1')).rejects.toMatchObject({ code: 'EMPTY_FILE', status: 200 })
  })

  it('preserves an error envelope, HTTP status, and Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'RATE_LIMITED', message: 'Too many requests.', data: null, requestId: 'req-3',
    }, 429, { 'Retry-After': '17' })))

    await expect(api.currentClass()).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryAfter: 17,
      message: 'Too many requests.',
    })
  })

  it('stops paginated roster loading if a later page makes no progress', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'OK', message: 'ok', data: {
        items: [{ id: 's1', studentNo: '1', name: '甲', groups: [] }], total: 2, page: 1, pageSize: 1,
      }, requestId: 'req-4' }))
      .mockResolvedValueOnce(jsonResponse({ code: 'OK', message: 'ok', data: {
        items: [], total: 2, page: 2, pageSize: 1,
      }, requestId: 'req-5' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.listStudents('class-1')).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'INVALID_RESPONSE',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // C1：下载 / 导出的成功路径必须真的触发浏览器下载——用 mock 的 URL 与 DOM 断言
  // createObjectURL、anchor.download、anchor.click、revokeObjectURL 都按序发生，不依赖真实浏览器。
  function stubDownloadDom(): { anchor: HTMLAnchorElement; click: ReturnType<typeof vi.fn>; createObjectURL: ReturnType<typeof vi.fn>; revokeObjectURL: ReturnType<typeof vi.fn>; restore: () => void } {
    const click = vi.fn()
    const anchor = document.createElement('a')
    Object.defineProperty(anchor, 'click', { value: click })
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => (
      tagName.toLowerCase() === 'a'
        ? anchor
        : document.createElementNS('http://www.w3.org/1999/xhtml', tagName)
    )) as typeof document.createElement)

    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL

    return {
      anchor,
      click,
      createObjectURL,
      revokeObjectURL,
      restore: () => {
        createElementSpy.mockRestore()
        URL.createObjectURL = originalCreate
        URL.revokeObjectURL = originalRevoke
      },
    }
  }

  it('triggers a real browser download for a non-empty attachment response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': "attachment; filename*=UTF-8''%E4%BD%9C%E4%B8%9A.pdf",
      },
    })))
    const download = stubDownloadDom()

    try {
      await expect(api.download('file-1', 'receipt-1')).resolves.toBeUndefined()
    } finally {
      download.restore()
    }

    expect(download.createObjectURL).toHaveBeenCalledTimes(1)
    expect((download.createObjectURL.mock.calls[0][0] as Blob).size).toBe(3)
    expect(download.click).toHaveBeenCalledTimes(1)
    expect(download.anchor.download).toBe('作业.pdf')
    expect(download.anchor.getAttribute('href')).toBe('blob:mock-url')
    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('exports a non-empty file with the fallback name and the admin token', async () => {
    sessionStorage.setItem('hcs.teacher-key', 'key-1')
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 0, 1, 0]), {
      status: 200,
      headers: { 'content-type': 'application/zip' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const download = stubDownloadDom()

    try {
      await expect(api.exportFile('assignment-9', 'zip')).resolves.toBeUndefined()
    } finally {
      download.restore()
    }

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/assignments/assignment-9/exports?format=zip')
    expect(init.headers).toMatchObject({ 'X-Demo-Admin-Token': 'key-1' })
    expect(download.click).toHaveBeenCalledTimes(1)
    expect(download.anchor.download).toBe('作业.zip')
    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  // C3：下载 / 导出失败时保留错误信封的 code / Retry-After，供 T8 差异化文案映射。
  it('preserves a 429 envelope and Retry-After when an attachment download fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'RATE_LIMITED', message: '请求过于频繁。', data: null, requestId: 'req-6',
    }, 429, { 'Retry-After': '23' })))

    await expect(api.download('file-1', 'receipt-1')).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'RATE_LIMITED',
      status: 429,
      retryAfter: 23,
      message: '请求过于频繁。',
    })
  })

  it('preserves a 413 envelope when an export fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'FILE_TOO_LARGE', message: '导出内容超出上限。', data: null, requestId: 'req-7',
    }, 413)))

    await expect(api.exportFile('assignment-9', 'zip')).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      status: 413,
    })
  })

  it('preserves a 503 envelope when a teacher attachment download fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用。', data: null, requestId: 'req-8',
    }, 503)))

    await expect(api.downloadSubmissionFile('assignment-1', 'submission-1', 'file-1')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    })
  })

  it('falls back to the download code and Chinese copy for a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gateway timeout', {
      status: 504,
      headers: { 'content-type': 'text/plain' },
    })))

    await expect(api.download('file-1', 'receipt-1')).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
      status: 504,
      message: '文件暂时无法下载，请稍后重试；若持续失败，请联系教师。',
    })
  })

  it('falls back to the export code and Chinese copy for a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', {
      status: 502,
      headers: { 'content-type': 'text/plain' },
    })))

    await expect(api.exportFile('assignment-9', 'csv')).rejects.toMatchObject({
      code: 'EXPORT_FAILED',
      status: 502,
    })
  })

  it('ignores an error envelope whose code is not a string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 429, message: 17, data: null, requestId: 'req-9',
    }, 429)))

    await expect(api.download('file-1', 'receipt-1')).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
      message: '文件暂时无法下载，请稍后重试；若持续失败，请联系教师。',
      status: 429,
    })
  })
})
