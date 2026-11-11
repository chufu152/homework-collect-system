import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api } = vi.hoisted(() => ({ api: { listAssignments: vi.fn() } }))

vi.mock('../api/client', () => ({ api }))
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
    api.listAssignments.mockResolvedValue({ items: [], total: 0 })
  })

  it('explains an empty assignment list and offers the first setup actions', async () => {
    const wrapper = mount(TeacherHomeView, { global: { stubs: routerStubs } })
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
    const wrapper = mount(TeacherHomeView, { global: { stubs: routerStubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('草稿，学生还不能打开')
    expect(wrapper.text()).toContain('收取中')
    expect(wrapper.text()).toContain('已停止收取，仍可查看提交情况')
  })

  it('offers an in-place retry when the assignment list cannot be loaded', async () => {
    api.listAssignments.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ items: [], total: 0 })
    const wrapper = mount(TeacherHomeView, { global: { stubs: routerStubs } })
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
})
