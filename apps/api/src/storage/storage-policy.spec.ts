import { describe, expect, it } from 'vitest'
import { safeDownloadName, validateUploadContent, validateUploadMetadata } from './storage-policy.js'

describe('upload allowlist', () => {
  it('rejects mismatched extensions, MIME types, and unsupported formats', () => {
    expect(validateUploadMetadata('notes.pdf', 'application/pdf', ['pdf'])).toBe(true)
    expect(validateUploadMetadata('notes.pdf', 'image/png', ['pdf'])).toBe(false)
    expect(validateUploadMetadata('payload.exe', 'application/octet-stream', ['pdf'])).toBe(false)
    expect(validateUploadMetadata('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx'])).toBe(true)
  })

  it('checks file signatures and rejects a text file disguised as PDF', async () => {
    const forgedPdf = Buffer.from('<html>not a pdf</html>', 'utf8')
    const validPdfHeader = Buffer.from('%PDF-1.7\\n1 0 obj\\n<<>>\\nendobj\\n%%EOF', 'utf8')
    expect(await validateUploadContent('homework.pdf', 'application/pdf', forgedPdf, ['pdf'])).toBe(false)
    expect(await validateUploadContent('homework.pdf', 'application/pdf', validPdfHeader, ['pdf'])).toBe(true)
  })
})

describe('download filenames', () => {
  it('removes path components and control characters without exposing stored keys', () => {
    expect(safeDownloadName('C:\\private\\../答题\n结果.pdf')).toBe('答题结果.pdf')
  })
})
