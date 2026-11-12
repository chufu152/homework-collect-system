import { Logger } from '@nestjs/common'
import type { Readable } from 'node:stream'
import type { Response } from 'express'

export interface DownloadableFile {
  content: Readable | Buffer
  contentType: string
  downloadName: string
  sizeBytes?: number
}

/** 下载端点返回值：S3/R2 驱动给预签名直链，local 驱动给可流式转发的文件。 */
export type DownloadResult = { redirectUrl: string } | DownloadableFile

export function isRedirectDownload(file: DownloadResult): file is { redirectUrl: string } {
  return 'redirectUrl' in file
}

/**
 * Single place that writes download headers. Attachment bytes are streamed so
 * a large file never has to be held in the API process' memory; generated
 * exports (CSV/DOCX/ZIP) are still sent as buffers.
 */
export function sendDownload(response: Response, file: DownloadableFile): void {
  response.setHeader('Content-Type', file.contentType)
  response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.downloadName)}`)
  const length = file.sizeBytes ?? (Buffer.isBuffer(file.content) ? file.content.byteLength : undefined)
  if (length !== undefined) response.setHeader('Content-Length', length)

  if (Buffer.isBuffer(file.content)) {
    response.send(file.content)
    return
  }

  const stream = file.content
  stream.on('error', (error: unknown) => {
    Logger.error('Failed to stream a stored file', error instanceof Error ? error.stack : String(error), 'FileResponse')
    if (!response.headersSent) {
      response.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'The stored file could not be read.',
        details: [],
        requestId: response.getHeader('X-Request-Id') ?? '',
      })
    } else {
      response.destroy(error instanceof Error ? error : undefined)
    }
  })
  response.on('close', () => stream.destroy())
  stream.pipe(response)
}

/**
 * S3/R2 驱动：下载端点改发预签名直链（JSON 信封，与全局响应结构一致），
 * 前端拿到后直接从对象存储下载，文件流量不经过本服务。
 */
export function sendRedirectPayload(response: Response, redirectUrl: string): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.json({
    code: 'OK',
    message: 'ok',
    data: { redirectUrl },
    requestId: response.getHeader('X-Request-Id') ?? '',
  })
}
