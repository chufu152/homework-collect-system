import { Logger } from '@nestjs/common'
import type { Readable } from 'node:stream'
import type { Response } from 'express'

export interface DownloadableFile {
  content: Readable | Buffer
  contentType: string
  downloadName: string
  sizeBytes?: number
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
