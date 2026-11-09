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
    // Two uploads may legitimately share a file name (or two students may share
    // a folder name). Keep both by appending a numeric suffix instead of
    // failing the whole export with an opaque 500.
    const basePath = safeParts.join('/')
    let safePath = basePath
    if (Object.prototype.hasOwnProperty.call(files, safePath)) {
      const separator = safePath.lastIndexOf('/')
      const dot = safePath.lastIndexOf('.')
      const stem = dot > separator + 1 ? safePath.slice(0, dot) : safePath
      const extension = dot > separator + 1 ? safePath.slice(dot) : ''
      let suffix = 2
      do {
        safePath = `${stem}-${suffix}${extension}`
        suffix += 1
      } while (Object.prototype.hasOwnProperty.call(files, safePath))
    }
    files[safePath] = new Uint8Array(entry.content)
  }
  return Buffer.from(zipSync(files, { level: 6 }))
}
