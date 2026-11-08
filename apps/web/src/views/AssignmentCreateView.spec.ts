import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api } = vi.hoisted(() => ({
  api: {
    currentClass: vi.fn(),
    listGroups: vi.fn(),
    listStudents: vi.fn(),
    createAssignment: vi.fn(),
  },
}))

vi.mock('../api/client', () => ({ api }))
import AssignmentCreateView from './AssignmentCreateView.vue'

const routerStubs = { RouterLink: { template: '<a><slot /></a>' } }

describe('assignment creation form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.currentClass.mockResolvedValue({ classId: 'class-1', name: '三年级一班', studentCount: 24 })
    api.listGroups.mockResolvedValue([])
    api.listStudents.mockResolvedValue({ items: [], total: 24 })
    api.createAssignment.mockResolvedValue({
      id: 'assignment-1',
      title: '周五练习',
      type: 'online',
      state: 'published',
      dueAt: null,
      expectedCount: 24,
      submittedCount: 0,
      missingCount: 24,
      shareUrl: 'http://127.0.0.1:5173/a/share-code',
    })
  })

  it('publishes a full-class assignment and displays its student share link', async () => {
    const wrapper = mount(AssignmentCreateView, { global: { stubs: routerStubs } })
    await flushPromises()
    await wrapper.get('input[placeholder="例如：周五数学练习"]').setValue('周五练习')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.createAssignment).toHaveBeenCalledWith(expect.objectContaining({
      title: '周五练习',
      type: 'online',
      target: { mode: 'all' },
      publishNow: true,
    }))
    expect(wrapper.text()).toContain('作业已发布')
    expect(wrapper.get('[aria-label="学生分享链接"]').element.getAttribute('value')).toBe('http://127.0.0.1:5173/a/share-code')
  })
})
