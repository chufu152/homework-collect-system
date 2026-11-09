import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import type { Express } from 'express'
import { safeDownloadName } from './storage-policy.js'

@Injectable()
export class StorageService {
  private readonly driver = process.env.STORAGE_DRIVER ?? 'local'
  private readonly localRoot = path.resolve(process.env.UPLOAD_DIR ?? 'var/uploads')
  private readonly bucket = process.env.S3_BUCKET ?? ''
  private readonly s3: S3Client | null

  constructor() {
    if (this.driver === 's3') {
      if (!this.bucket) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3.')
      const endpoint = process.env.S3_ENDPOINT
      const accessKeyId = process.env.S3_ACCESS_KEY_ID
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
      if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
        throw new Error('Configure both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither.')
      }
      this.s3 = new S3Client({
        region: process.env.S3_REGION ?? 'auto',
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
        ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
      })
    } else if (this.driver === 'local') {
      this.s3 = null
    } else {
      throw new Error('STORAGE_DRIVER must be local or s3.')
    }
  }

  makeObjectKey(assignmentId: string, studentId: string, originalName: string): string {
    return `${assignmentId}/${studentId}/${randomUUID()}-${safeDownloadName(originalName)}`
  }

  async save(key: string, file: Express.Multer.File): Promise<void> {
    if (this.driver === 's3') {
      if (!this.s3) throw new ServiceUnavailableException('Object storage is not configured.')
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ServerSideEncryption: 'AES256',
      }))
      return
    }

    const fullPath = this.resolveLocalPath(key)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, file.buffer, { flag: 'wx' })
  }

  async read(key: string): Promise<Buffer> {
    if (this.driver === 's3') {
      if (!this.s3) throw new ServiceUnavailableException('Object storage is not configured.')
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!response.Body) throw new Error('Stored object has no response body.')
      return Buffer.from(await response.Body.transformToByteArray())
    }
    return readFile(this.resolveLocalPath(key))
  }

  /**
   * Streams a stored object instead of buffering it in memory. Used by every
   * download route; `read()` stays for exports that need the complete bytes.
   */
  async openReadStream(key: string): Promise<Readable> {
    if (this.driver === 's3') {
      if (!this.s3) throw new ServiceUnavailableException('Object storage is not configured.')
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!response.Body) throw new Error('Stored object has no response body.')
      return Readable.fromWeb(response.Body.transformToWebStream() as Parameters<typeof Readable.fromWeb>[0])
    }

    const fullPath = this.resolveLocalPath(key)
    // Fail before any response headers are written when the object has gone missing.
    await access(fullPath)
    return createReadStream(fullPath)
  }

  async remove(key: string): Promise<void> {
    if (this.driver === 's3') {
      if (this.s3) await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      return
    }
    await rm(this.resolveLocalPath(key), { force: true })
  }

  private resolveLocalPath(key: string): string {
    if (!key || key.includes('\\') || key.startsWith('/') || key.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error('Invalid internal storage key.')
    }
    const fullPath = path.resolve(this.localRoot, key)
    if (!fullPath.startsWith(`${this.localRoot}${path.sep}`)) throw new Error('Storage key escapes the private upload directory.')
    return fullPath
  }
}
