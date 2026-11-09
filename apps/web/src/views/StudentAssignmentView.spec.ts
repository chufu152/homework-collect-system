import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api } = vi.hoisted(() => ({
  api: {
    getPublicAssignment: vi.fn(),
    checkIn: vi.fn(),
    getRelayEntries: vi.fn(),
    joinRelay: vi.fn(),
    submitAssignment: vi.fn(),
  },
}))

vi.mock('../api/client', () => ({ api, ApiRequestError: class ApiRequestError extends Error {} }))
import StudentAssignmentView from './StudentAssignmentView.vue'

describe('student assignment check-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-1',
      title: '周一签到',
      type: 'checkin',
      instructions: '进入教室后签到',
      state: 'published',
    })
    api.checkIn.mockResolvedValue({
      displayName: '张三',
      checkedInAt: '2026-11-08T12:00:00.000Z',
      alreadyCheckedIn: false,
    })
  })

  it('submits the student identity and displays a clear check-in receipt', async () => {
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('周一签到')
    await wrapper.get('[aria-label="学号"]').setValue('2026001')
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.checkIn).toHaveBeenCalledWith('share-code', { studentNo: '2026001', studentName: '张三' })
    expect(wrapper.text()).toContain('签到成功')
    expect(wrapper.text()).toContain('张三')
  })

  it('keeps the receipt and allows a versioned resubmission of online homework', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-2', title: '周五数学练习', type: 'online', instructions: '', state: 'published',
      dueAt: null, submissionMode: 'text', allowedFileTypes: ['pdf'], maxFileCount: 1, maxFileSizeMB: 20,
    })
    api.submitAssignment
      .mockResolvedValueOnce({ submissionId: 'sub-1', receiptCode: 'receipt-1', version: 1, submittedAt: '2026-11-08T12:00:00.000Z', files: [] })
      .mockResolvedValueOnce({ submissionId: 'sub-1', receiptCode: 'receipt-1', version: 2, submittedAt: '2026-11-08T12:05:00.000Z', files: [] })

    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await wrapper.get('[aria-label="学号"]').setValue('2026001')
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('textarea').setValue('第一版答案')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('当前为第 1 版')
    expect(wrapper.text()).toContain('查看提交回执')

    await wrapper.get('.receipt-link-block button[type="button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('textarea').exists()).toBe(true)

    await wrapper.get('textarea').setValue('第二版答案')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.submitAssignment).toHaveBeenCalledTimes(2)
    expect(api.submitAssignment).toHaveBeenLastCalledWith('share-code', expect.objectContaining({ textContent: '第二版答案' }))
    expect(wrapper.text()).toContain('当前为第 2 版')
  })

  it('joins a relay and refreshes the ordered entry list', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-3', title: '周日接龙', type: 'relay', instructions: '', state: 'published',
      dueAt: null, submissionMode: 'text', allowedFileTypes: [], maxFileCount: 0, maxFileSizeMB: 20,
    })
    api.getRelayEntries
      .mockResolvedValueOnce({ items: [{ position: 1, displayName: '王五', content: '我参加' }] })
      .mockResolvedValueOnce({ items: [
        { position: 1, displayName: '王五', content: '我参加' },
        { position: 2, displayName: '张三', content: '算我一个' },
      ] })
    api.joinRelay.mockResolvedValue({ position: 2, alreadyJoined: false })

    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('已经加入的同学')
    expect(wrapper.text()).toContain('王五')

    await wrapper.get('[aria-label="学号"]').setValue('2026001')
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('input[placeholder="例如：我可以参加"]').setValue('算我一个')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.joinRelay).toHaveBeenCalledWith('share-code', {
      studentNo: '2026001', studentName: '张三', content: '算我一个',
    })
    expect(wrapper.text()).toContain('接龙成功，你排在第 2 位。')
    expect(wrapper.text()).toContain('算我一个')
    expect(api.getRelayEntries).toHaveBeenCalledTimes(2)
  })
})
