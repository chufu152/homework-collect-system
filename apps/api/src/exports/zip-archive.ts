import { zipSync, type Zippable } from 'fflate'
import { safeDownloadName } from '../storage/storage-policy.js'

export interface ZipArchiveEntry {
  name: string
  content: Buffer | Uint8Array
}

export async function createZipArchive(entries: readonly ZipArchiveEntry[]): Promise<Buffer> {
  const files: Zippable = {}
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, '/')
    const pathParts = normalized.split('/')
    if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || pathParts.some((part) => !part || part === '.' || part === '..')) {
      throw new Error('Invalid ZIP entry path.')
    }
    const safeParts = pathParts.map((part, index) => index === pathParts.length - 1 ? safeDownloadName(part) : part.replace(/[<>:"|?*\u0000-\u001f\u007f]/g, '-'))
    const safePath = safeParts.join('/')
    if (Object.prototype.hasOwnProperty.call(files, safePath)) throw new Error('Duplicate ZIP entry path.')
    files[safePath] = new Uint8Array(entry.content)
  }
  return Buffer.from(zipSync(files, { level: 6 }))
}
