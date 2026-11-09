import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { createZipArchive } from './zip-archive.js'

function listZipEntryNames(zip: Buffer): string[] {
  const names: string[] = []
  let offset = 0
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = zip.readUInt16LE(offset + 26)
    const extraLength = zip.readUInt16LE(offset + 28)
    names.push(zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8'))
    const compressedSize = zip.readUInt32LE(offset + 18)
    offset += 30 + nameLength + extraLength + compressedSize
  }
  return names
}

describe('submission ZIP export', () => {
  it('streams files with student folders and safe download names into a valid ZIP', async () => {
    const archive = await createZipArchive([
      { name: '1001-张三-周测/解答.pdf', content: Buffer.from('%PDF-1.7 test') },
      { name: '1002-李四-周测/答案.txt', content: Buffer.from('完成') },
    ])
    expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304')
    expect(listZipEntryNames(archive)).toEqual([
      '1001-张三-周测/解答.pdf',
      '1002-李四-周测/答案.txt',
    ])
  })

  it('keeps both attachments when uploads share a file name instead of failing the export', async () => {
    const archive = await createZipArchive([
      { name: '1001-张三-周测/答案.pdf', content: Buffer.from('first') },
      { name: '1001-张三-周测/答案.pdf', content: Buffer.from('second') },
      { name: '1001-张三-周测/答案-2.pdf', content: Buffer.from('third') },
    ])
    const names = listZipEntryNames(archive)
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3)
    expect(names[0]).toBe('1001-张三-周测/答案.pdf')
    expect(names[1]).toBe('1001-张三-周测/答案-2.pdf')
    const contents = unzipSync(new Uint8Array(archive))
    expect(Buffer.from(contents[names[0]]).toString()).toBe('first')
    expect(Buffer.from(contents[names[1]]).toString()).toBe('second')
  })

  it('rejects ZIP entry path traversal', async () => {
    await expect(createZipArchive([{ name: '../private.txt', content: Buffer.from('secret') }]))
      .rejects.toThrow('Invalid ZIP entry path.')
  })
})
