import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api, getActiveClass } = vi.hoisted(() => ({
  api: { listAssignments: vi.fn(), deleteAssignment: vi.fn() },
  getActiveClass: vi.fn(),
}))

vi.mock('../api/client', () => ({ api, getActiveClass }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import TeacherHomeView from './TeacherHomeView.vue'

const routerStubs = { RouterLink: { template: '<a><slot /></a>' } }

function assignment(id: string, state: 'draft' | 'published' | 'closed') {
  return {
    id,
    title: `${state} 作业`,
    type: 'online' as const,
    state,
    dueAt: null,
    expectedCount: 2,
    submittedCount: 1,
    missingCount: 1,
    shareUrl: `http://127.0.0.1:5173/a/${id}`,
  }
}

describe('teacher home assignment boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getActiveClass.mockReturnValue({ classId: 'class-1', name: '三年级一班', teacherKey: 'teacher-key' })
    api.listAssignments.mockResolvedValue({ items: [], total: 0 })
  })

  it('explains an empty assignment list and offers the first setup actions', async () => {
    const wrapper = mount(TeacherHomeView, { global: { stubs: { ...routerStubs, teleport: true } } })
    await flushPromises()

    expect(wrapper.text()).toContain('还没有发布作业')
    expect(wrapper.text()).toContain('建立班级名单')
    expect(wrapper.text()).toContain('发布作业')
  })

  it('labels draft, published, and closed assignments distinctly', async () => {
    api.listAssignments.mockResolvedValue({
      items: [assignment('a1', 'draft'), assignment('a2', 'published'), assignment('a3', 'closed')],
      total: 3,
    })
    const wrapper = mount(TeacherHomeView, { global: { stubs: { ...routerStubs, teleport: true } } })
    await flushPromises()

    expect(wrapper.text()).toContain('草稿，学生还不能打开')
    expect(wrapper.text()).toContain('收取中')
    expect(wrapper.text()).toContain('已停止收取，仍可查看提交情况')
  })

  it('offers an in-place retry when the assignment list cannot be loaded', async () => {
    api.listAssignments.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ items: [], total: 0 })
    const wrapper = mount(TeacherHomeView, { global: { stubs: { ...routerStubs, teleport: true } } })
    await flushPromises()

    expect(wrapper.text()).toContain('网络连接失败')
    const retry = wrapper.findAll('button').find((button) => button.text() === '重新加载作业')
    expect(retry).toBeDefined()
    await retry!.trigger('click')
    await flushPromises()

    expect(api.listAssignments).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('还没有发布作业')
    expect(wrapper.text()).not.toContain('网络连接失败')
  })

  it('deletes an assignment only after the frosted-glass confirm dialog', async () => {
    api.listAssignments.mockResolvedValue({ items: [assignment('a3', 'closed')], total: 1 })
    api.deleteAssignment.mockResolvedValue({ removed: true, removedFiles: 2 })
    const wrapper = mount(TeacherHomeView, { global: { stubs: { ...routerStubs, teleport: true } } })
    await flushPromises()

    // 点击删除按钮本身不会触发行跳转（router.push 未被调用）。
    await wrapper.get('button.assignment-delete').trigger('click')
    expect(wrapper.text()).toContain('确认删除作业')
    expect(wrapper.text()).toContain('1 份提交的附件文件')
    expect(api.deleteAssignment).not.toHaveBeenCalled()

    await wrapper.get('.confirm-panel').get('.button.ghost').trigger('click')
    expect(api.deleteAssignment).not.toHaveBeenCalled()
    expect(wrapper.find('.confirm-panel').exists()).toBe(false)

    await wrapper.get('button.assignment-delete').trigger('click')
    await wrapper.get('.confirm-panel').get('.button.danger-solid').trigger('click')
    await flushPromises()

    expect(api.deleteAssignment).toHaveBeenCalledWith('a3')
    expect(wrapper.text()).toContain('已删除')
    expect(wrapper.text()).not.toContain('已结束')
  })

  it('keeps the assignment listed and explains the failure when deletion is rejected', async () => {
    api.listAssignments.mockResolvedValue({ items: [assignment('a3', 'closed')], total: 1 })
    api.deleteAssignment.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const wrapper = mount(TeacherHomeView, { global: { stubs: { ...routerStubs, teleport: true } } })
    await flushPromises()

    await wrapper.get('button.assignment-delete').trigger('click')
    await wrapper.get('.confirm-panel').get('.button.danger-solid').trigger('click')
    await flushPromises()

    // 失败提示以独立 alert 展示，列表不被顶掉。
    expect(wrapper.get('[role="alert"]').text()).toContain('网络连接失败')
    expect(wrapper.text()).toContain('已结束')
    expect(wrapper.find('.confirm-panel').exists()).toBe(false)
  })
})
