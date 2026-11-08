import { fileTypeFromBuffer } from 'file-type'

const allowedContentTypes: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  txt: 'text/plain',
  zip: 'application/zip',
}

export function validateUploadMetadata(
  originalName: string,
  contentType: string,
  assignmentAllowedTypes: readonly string[],
): boolean {
  const baseName = originalName.replace(/\\/g, '/').split('/').pop() ?? ''
  const extension = baseName.split('.').pop()?.toLowerCase()
  if (!extension || !assignmentAllowedTypes.map((type) => type.replace(/^\./, '').toLowerCase()).includes(extension)) return false
  const expectedType = allowedContentTypes[extension]
  return !!expectedType && contentType.toLowerCase().split(';')[0].trim() === expectedType
}

export async function validateUploadContent(
  originalName: string,
  contentType: string,
  content: Buffer,
  assignmentAllowedTypes: readonly string[],
): Promise<boolean> {
  if (!validateUploadMetadata(originalName, contentType, assignmentAllowedTypes) || content.length === 0) return false
  const extension = (originalName.replace(/\\/g, '/').split('/').pop() ?? '').split('.').pop()?.toLowerCase()
  const detected = await fileTypeFromBuffer(content)

  if (extension === 'txt') {
    if (detected) return false
    const decoded = content.toString('utf8')
    if (decoded.includes('\uFFFD')) return false
    return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(decoded)
  }
  if (extension === 'doc') return content.subarray(0, 8).equals(Buffer.from('D0CF11E0A1B11AE1', 'hex'))
  if (!extension || !detected) return false
  if (extension === 'docx' || extension === 'zip') return detected.mime === 'application/zip' || detected.mime === 'application/x-zip-compressed'
  return detected.mime === allowedContentTypes[extension]
}

export function safeDownloadName(originalName: string): string {
  const leaf = originalName.replace(/\\/g, '/').split('/').pop() ?? 'file'
  const safe = leaf
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '-')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
  return safe || 'file'
}
