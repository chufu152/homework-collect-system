import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import type { Express } from 'express'
import { safeDownloadName } from './storage-policy.js'
import { presignS3GetUrl } from './sigv4.js'

const PRESIGN_EXPIRES_SECONDS = 600
/** 主存储（教师电脑挂载）健康探测结果的缓存时长。 */
const PRIMARY_PROBE_TTL_MS = 30_000
/** 挂载断开时 IO 可能无限挂起，所有主存储操作都必须带超时。 */
const PRIMARY_IO_TIMEOUT_MS = 10_000
/** 电脑恢复在线后，回收暂存文件的巡检间隔。 */
const SYNC_INTERVAL_MS = 5 * 60_000
/** 启动后首次巡检的延迟，给挂载一点准备时间。 */
const FIRST_SYNC_DELAY_MS = 15_000

/** 给任意 IO 操作加超时：挂载假死时不能让请求无限挂起。 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

@Injectable()
export class StorageService {
  private readonly driver = process.env.STORAGE_DRIVER ?? 'local'
  private readonly localRoot = path.resolve(process.env.UPLOAD_DIR ?? 'var/uploads')
  /** 服务器本地暂存目录：教师电脑关机时新附件落在这里，恢复后自动回收。 */
  private readonly fallbackRoot = path.resolve(process.env.STORAGE_FALLBACK_DIR ?? path.join(process.cwd(), 'var', 'storage-fallback'))
  private readonly bucket = process.env.S3_BUCKET ?? ''
  private readonly s3: S3Client | null

  private primaryHealthy = true
  private lastProbeAt = 0
  private probeInFlight: Promise<boolean> | null = null
  private syncing = false
  private syncTimer: NodeJS.Timeout | null = null

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
      if (this.fallbackRoot === this.localRoot) throw new Error('STORAGE_FALLBACK_DIR must differ from UPLOAD_DIR.')
      this.s3 = null
    } else {
      throw new Error('STORAGE_DRIVER must be local or s3.')
    }
  }

  /** local 驱动下启动巡检：电脑恢复在线后把暂存文件搬回教师电脑。 */
  onModuleInit(): void {
    if (this.driver !== 'local') return
    const initial = setTimeout(() => void this.syncFallbackToPrimary(), FIRST_SYNC_DELAY_MS)
    initial.unref?.()
    this.syncTimer = setInterval(() => void this.syncFallbackToPrimary(), SYNC_INTERVAL_MS)
    this.syncTimer.unref?.()
  }

  onModuleDestroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.syncTimer = null
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

    // 动态存储：主盘健康就直接写教师电脑；写失败（断挂载/超时）立即降级到服务器暂存。
    if (await this.checkPrimaryHealth()) {
      try {
        await withTimeout(this.writePrimary(key, file.buffer), PRIMARY_IO_TIMEOUT_MS, 'Primary storage write')
        return
      } catch {
        this.markPrimaryUnhealthy()
      }
    }
    await this.writeFallback(key, file.buffer)
  }

  async read(key: string): Promise<Buffer> {
    if (this.driver === 's3') {
      if (!this.s3) throw new ServiceUnavailableException('Object storage is not configured.')
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!response.Body) throw new Error('Stored object has no response body.')
      return Buffer.from(await response.Body.transformToByteArray())
    }
    try {
      return await withTimeout(readFile(this.resolveLocalPath(key)), PRIMARY_IO_TIMEOUT_MS, 'Primary storage read')
    } catch (primaryError) {
      try {
        return await readFile(this.resolveFallbackPath(key))
      } catch {
        throw primaryError
      }
    }
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
    // 挂载假死时 access 可能挂起，超时后转查服务器暂存目录。
    try {
      await withTimeout(access(fullPath), PRIMARY_IO_TIMEOUT_MS, 'Primary storage access')
      return createReadStream(fullPath)
    } catch (primaryError) {
      const fallbackPath = this.resolveFallbackPath(key)
      try {
        await access(fallbackPath)
        return createReadStream(fallbackPath)
      } catch {
        throw primaryError
      }
    }
  }

  async remove(key: string): Promise<void> {
    if (this.driver === 's3') {
      if (this.s3) await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      return
    }
    // 两边都删：文件可能刚被同步回主盘，也可能还留在暂存目录。
    await rm(this.resolveLocalPath(key), { force: true }).catch(() => undefined)
    await rm(this.resolveFallbackPath(key), { force: true }).catch(() => undefined)
  }

  /**
   * 回收巡检：主盘健康时把暂存目录里的文件搬回教师电脑，搬成功后删掉服务器副本。
   * 目标已存在（上次搬完删失败了）时直接删除本地副本，避免重复占用。
   */
  async syncFallbackToPrimary(): Promise<number> {
    if (this.driver !== 'local' || this.syncing) return 0
    if (!(await this.checkPrimaryHealth(true))) return 0
    this.syncing = true
    try {
      const keys = await this.listFallbackKeys()
      let moved = 0
      for (const key of keys) {
        const sourcePath = this.resolveFallbackPath(key)
        const targetPath = this.resolveLocalPath(key)
        try {
          const exists = await access(targetPath).then(() => true).catch(() => false)
          if (!exists) {
            const buffer = await readFile(sourcePath)
            await mkdir(path.dirname(targetPath), { recursive: true })
            await writeFile(targetPath, buffer, { flag: 'w' })
          }
          await rm(sourcePath, { force: true })
          moved += 1
        } catch (error) {
          console.error(`[storage] 回收暂存文件失败：${key}`, error)
        }
      }
      await this.pruneEmptyDirs(this.fallbackRoot)
      if (moved > 0) console.log(`[storage] 教师电脑已恢复在线，${moved} 个暂存附件已同步回本地存储。`)
      return moved
    } finally {
      this.syncing = false
    }
  }

  /** 当前主盘健康状态（测试与运维排查用）。 */
  isPrimaryHealthy(): boolean {
    return this.primaryHealthy
  }

  /**
   * S3/R2 驱动：生成 10 分钟有效的预签名下载直链，文件流量不经过本服务；
   * local 驱动返回 null，调用方降级为服务端流式转发。
   */
  presignedDownloadUrl(key: string, downloadName: string): string | null {
    if (this.driver !== 's3' || !this.s3 || !this.bucket) return null
    const credentials = this.s3.config.credentials as { accessKeyId?: string; secretAccessKey?: string }
    if (!credentials?.accessKeyId || !credentials?.secretAccessKey) return null
    const endpoint = process.env.S3_ENDPOINT
    const host = endpoint ? new URL(endpoint).host : 's3.amazonaws.com'
    const region = typeof this.s3.config.region === 'string' ? this.s3.config.region : 'auto'
    return presignS3GetUrl({
      host,
      bucket: this.bucket,
      key,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region,
      expiresSeconds: PRESIGN_EXPIRES_SECONDS,
      responseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(safeDownloadName(downloadName))}`,
    })
  }

  private assertValidKey(key: string): void {
    if (!key || key.includes('\\') || key.startsWith('/') || key.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error('Invalid internal storage key.')
    }
  }

  private resolveLocalPath(key: string): string {
    this.assertValidKey(key)
    const fullPath = path.resolve(this.localRoot, key)
    if (!fullPath.startsWith(`${this.localRoot}${path.sep}`)) throw new Error('Storage key escapes the private upload directory.')
    return fullPath
  }

  private resolveFallbackPath(key: string): string {
    this.assertValidKey(key)
    const fullPath = path.resolve(this.fallbackRoot, key)
    if (!fullPath.startsWith(`${this.fallbackRoot}${path.sep}`)) throw new Error('Storage key escapes the fallback directory.')
    return fullPath
  }

  private async writePrimary(key: string, buffer: Buffer): Promise<void> {
    const fullPath = this.resolveLocalPath(key)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, buffer, { flag: 'wx' })
  }

  private async writeFallback(key: string, buffer: Buffer): Promise<void> {
    const fullPath = this.resolveFallbackPath(key)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, buffer, { flag: 'w' })
  }

  /** 探测主盘可写性（建目录+写删一个探针文件），结果短期缓存；TTL 内直接用缓存值。 */
  private async checkPrimaryHealth(force = false): Promise<boolean> {
    if (!force && Date.now() - this.lastProbeAt < PRIMARY_PROBE_TTL_MS) return this.primaryHealthy
    if (this.probeInFlight) return this.probeInFlight
    this.probeInFlight = (async () => {
      try {
        const probePath = path.join(this.localRoot, '.health-probe')
        const probe = (async () => {
          await mkdir(this.localRoot, { recursive: true })
          await writeFile(probePath, Date.now().toString(), { flag: 'w' })
        })()
        await withTimeout(probe, PRIMARY_IO_TIMEOUT_MS, 'Primary storage probe')
        await rm(probePath, { force: true }).catch(() => undefined)
        this.primaryHealthy = true
      } catch {
        this.primaryHealthy = false
      }
      this.lastProbeAt = Date.now()
      return this.primaryHealthy
    })().finally(() => { this.probeInFlight = null })
    return this.probeInFlight
  }

  private markPrimaryUnhealthy(): void {
    this.primaryHealthy = false
    this.lastProbeAt = Date.now()
  }

  private async listFallbackKeys(): Promise<string[]> {
    const keys: string[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile()) {
          const rel = path.relative(this.fallbackRoot, full)
          keys.push(rel.split(path.sep).join('/'))
        }
      }
    }
    await walk(this.fallbackRoot)
    return keys
  }

  /** 自底向上清掉搬空后遗留的空目录（fallback 根目录本身保留）。 */
  private async pruneEmptyDirs(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      if (entry.isDirectory()) await this.pruneEmptyDirs(path.join(dir, entry.name))
    }
    if (dir === this.fallbackRoot) return
    const remaining = await readdir(dir).catch(() => ['x'])
    if (remaining.length === 0) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
