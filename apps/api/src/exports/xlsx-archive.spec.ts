import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createXlsx } from './xlsx-archive.js'

describe('minimal xlsx archive', () => {
  it('packs headers and rows into a valid worksheet with xml escaping', () => {
    const buffer = createXlsx([
      ['学号', '姓名', '备注'],
      ['S01', '张三', 'a<b & "c"'],
      ['', '李四', ''],
    ])
    const files = unzipSync(new Uint8Array(buffer))
    const sheet = new TextDecoder().decode(files['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('学号')
    expect(sheet).toContain('张三')
    expect(sheet).toContain('a&lt;b &amp; &quot;c&quot;')
    // 空单元格只是占位，不生成 inlineStr。
    expect(sheet).not.toContain('<t></t>')
    expect(files['xl/workbook.xml']).toBeDefined()
    expect(files['[Content_Types].xml']).toBeDefined()
  })
})
