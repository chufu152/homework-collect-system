import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api } = vi.hoisted(() => ({
  api: {
    receipt: vi.fn(),
    download: vi.fn(),
  },
}))

vi.mock('../api/client', () => ({ api }))
import StudentReceiptView from './StudentReceiptView.vue'

// 结构化的接口错误（与 ApiRequestError 同形），用于验证 B2 文案确实落到界面。
class FakeApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly retryAfter: number | null = null) {
    super(message)
  }
}

const receipt = {
  assignment: { id: 'assignment-1', title: '周五数学练习', type: 'online' as const, dueAt: null },
  submittedAt: '2026-11-08T12:00:00.000Z',
  version: 2,
  textContent: '答案：43',
  files: [{ id: 'file-1', originalName: 'answer-v2.pdf', contentType: 'application/pdf', sizeBytes: 1048576 }],
  feedback: { score: 95, feedbackText: '步骤清晰。', reviewedAt: '2026-11-08T13:00:00.000Z' },
  versions: [
    {
      version: 2, submittedAt: '2026-11-08T12:00:00.000Z', textContent: '答案：43',
      files: [{ id: 'file-1', originalName: 'answer-v2.pdf', contentType: 'application/pdf', sizeBytes: 1048576 }],
    },
    {
      version: 1, submittedAt: '2026-11-08T10:00:00.000Z', textContent: '答案：42',
      files: [{ id: 'file-v1', originalName: 'answer-v1.pdf', contentType: 'application/pdf', sizeBytes: 524288 }],
    },
  ],
}

function render() {
  return mount(StudentReceiptView, {
    props: { receiptCode: 'receipt-code' },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('student receipt page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.download.mockResolvedValue(undefined)
    api.receipt.mockResolvedValue(receipt)
  })

  it('shows the latest version, teacher feedback, and downloads files with the receipt code', async () => {
    const wrapper = render()
    await flushPromises()

    expect(api.receipt).toHaveBeenCalledWith('receipt-code')
    expect(wrapper.text()).toContain('周五数学练习')
    expect(wrapper.text()).toContain('第 2 版')
    expect(wrapper.text()).toContain('答案：43')
    expect(wrapper.text()).toContain('answer-v2.pdf')
    expect(wrapper.text()).toContain('分数：95')
    expect(wrapper.text()).toContain('步骤清晰。')

    await wrapper.find('.download-list .button').trigger('click')
    await flushPromises()
    expect(api.download).toHaveBeenCalledWith('file-1', 'receipt-code')
  })

  it('explains when no feedback has been given yet', async () => {
    api.receipt.mockResolvedValue({ ...receipt, feedback: null })
    const wrapper = render()
    await flushPromises()

    expect(wrapper.text()).toContain('老师尚未添加反馈')
    expect(wrapper.text()).not.toContain('分数：95')
  })

  it('states that the current submission version has no attachments', async () => {
    api.receipt.mockResolvedValue({ ...receipt, files: [], versions: [receipt.versions[0]] })
    const wrapper = render()
    await flushPromises()

    expect(wrapper.text()).toContain('当前提交版本没有附件')
    expect(wrapper.find('.download-list').exists()).toBe(false)
  })

  it('keeps a failed attachment download actionable for retry', async () => {
    api.download.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const wrapper = render()
    await flushPromises()

    const downloadButton = wrapper.find('.download-list .button')
    await downloadButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('网络连接失败')
    expect(downloadButton.attributes('disabled')).toBeUndefined()
    expect(api.download).toHaveBeenCalledWith('file-1', 'receipt-code')
  })

  it('offers a retry when the receipt cannot be loaded', async () => {
    api.receipt.mockRejectedValueOnce(new Error('回执无效')).mockResolvedValue(receipt)
    const wrapper = render()
    await flushPromises()

    expect(wrapper.text()).toContain('回执暂时无法打开')
    expect(wrapper.text()).toContain('回执无效')

    await wrapper.find('.status-panel .button').trigger('click')
    await flushPromises()
    expect(api.receipt).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('答案：43')
  })

  it('shows every submitted version and downloads a historical attachment with the same receipt code', async () => {
    const wrapper = render()
    await flushPromises()

    expect(wrapper.text()).toContain('查看历次修改（共 2 版）')
    expect(wrapper.text()).toContain('第 1 版')
    expect(wrapper.text()).toContain('答案：42')

    const historical = wrapper.findAll('.version-history .submission-files .button')
      .find((candidate) => candidate.text() === 'answer-v1.pdf')
    expect(historical).toBeDefined()
    await historical!.trigger('click')
    await flushPromises()

    expect(api.download).toHaveBeenCalledWith('file-v1', 'receipt-code')
  })

  it('hides the history panel when only one version exists', async () => {
    api.receipt.mockResolvedValue({ ...receipt, version: 1, versions: [receipt.versions[1]] })
    const wrapper = render()
    await flushPromises()

    expect(wrapper.text()).not.toContain('查看历次修改')
    expect(wrapper.text()).toContain('答案：43')
  })

  it('still renders the receipt when an older response has no versions field', async () => {
    api.receipt.mockResolvedValue({ ...receipt, versions: undefined })
    const wrapper = render()
    await flushPromises()

    expect(wrapper.text()).toContain('第 2 版')
    expect(wrapper.text()).toContain('答案：43')
    expect(wrapper.text()).not.toContain('查看历次修改')
  })

  it('shows a localized rate-limit message with the retry delay', async () => {
    api.receipt.mockRejectedValueOnce(new FakeApiError('Too many requests.', 'RATE_LIMITED', 429, 12))
    const wrapper = render()
    await flushPromises()

    expect(wrapper.text()).toContain('操作太频繁')
    expect(wrapper.text()).toContain('约 12 秒后重试')
  })

  it('shows a recoverable service-unavailable message without exposing the receipt code', async () => {
    api.receipt.mockRejectedValueOnce(new FakeApiError('Service unavailable.', 'SERVICE_UNAVAILABLE', 503))
    const wrapper = render()
    await flushPromises()

    expect(wrapper.text()).toContain('服务暂时不可用')
    expect(wrapper.text()).toContain('联系教师')
    expect(wrapper.text()).not.toContain('receipt-code')
  })
})
