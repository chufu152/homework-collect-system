import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard } from './clipboard'

// jsdom 的 navigator.clipboard 可能存在但 isSecureContext=false；
// 通过显式删除/恢复 clipboard 对象来模拟「安全上下文」与「HTTP 部署」两种环境。
const realClipboard = navigator.clipboard
const realSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext')

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    if (realClipboard) Object.defineProperty(navigator, 'clipboard', { value: realClipboard, configurable: true })
    else delete (navigator as unknown as { clipboard?: unknown }).clipboard
    if (realSecureContext) Object.defineProperty(window, 'isSecureContext', realSecureContext)
    document.body.querySelectorAll('textarea').forEach((el) => el.remove())
  })

  it('uses the standard clipboard API in secure contexts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

    await copyToClipboard('hello')

    expect(writeText).toHaveBeenCalledWith('hello')
    expect(document.body.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('falls back to execCommand with a temporary textarea over plain HTTP', async () => {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    const execCopy = vi.fn().mockReturnValue(true)
    document.execCommand = execCopy as unknown as typeof document.execCommand

    await copyToClipboard('share-url')

    expect(execCopy).toHaveBeenCalledWith('copy')
    // 降级用过的临时节点必须清理干净
    expect(document.body.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('rejects when the HTTP fallback copy command fails', async () => {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    document.execCommand = vi.fn().mockReturnValue(false) as unknown as typeof document.execCommand

    await expect(copyToClipboard('x')).rejects.toThrow('copy command rejected')
    expect(document.body.querySelectorAll('textarea')).toHaveLength(0)
  })
})
