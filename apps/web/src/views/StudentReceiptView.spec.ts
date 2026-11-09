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

const receipt = {
  assignment: { id: 'assignment-1', title: '周五数学练习', type: 'online' as const, dueAt: null },
  submittedAt: '2026-11-08T12:00:00.000Z',
  version: 2,
  textContent: '答案：43',
  files: [{ id: 'file-1', originalName: 'answer-v2.pdf', contentType: 'application/pdf', sizeBytes: 1048576 }],
  feedback: { score: 95, feedbackText: '步骤清晰。', reviewedAt: '2026-11-08T13:00:00.000Z' },
}

function render() {
  return mount(StudentReceiptView, {
    props: { receiptCode: 'receipt-code' },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('student receipt page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
