import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api } = vi.hoisted(() => ({
  api: {
    dashboard: vi.fn(),
    setAssignmentState: vi.fn(),
    setCompletion: vi.fn(),
    feedback: vi.fn(),
    exportFile: vi.fn(),
    downloadSubmissionFile: vi.fn(),
  },
}))

vi.mock('../api/client', () => ({ api }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import AssignmentDashboardView from './AssignmentDashboardView.vue'

const dashboard = {
  assignment: {
    id: 'assignment-1', title: '周五数学练习', type: 'online', state: 'published',
    dueAt: null, shareUrl: 'http://127.0.0.1:5173/a/share-code',
  },
  summary: { expected: 2, submitted: 1, missing: 1, late: 0 },
  missingMentionText: '@李四',
  items: [
    {
      studentId: 's1', studentNo: '2026001', name: '张三', submissionId: 'submission-1',
      status: 'submitted', submittedAt: '2026-11-08T12:00:00.000Z',
      textContent: '答案：42', files: [{ id: 'file-1', originalName: 'answer.pdf', sizeBytes: 2048 }],
      score: null, feedbackText: null,
    },
    {
      studentId: 's2', studentNo: '2026002', name: '李四', submissionId: null,
      status: 'missing', submittedAt: null, textContent: '', files: [],
      score: null, feedbackText: null,
    },
  ],
}

describe('teacher dashboard submission review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.dashboard.mockResolvedValue(dashboard)
    api.downloadSubmissionFile.mockResolvedValue(undefined)
  })

  it('shows the submitted text and downloads an attachment with the teacher key', async () => {
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('答案：42')
    expect(wrapper.text()).toContain('answer.pdf')

    const attachmentButtons = wrapper.findAll('.submission-files .button')
    await attachmentButtons[0].trigger('click')
    await flushPromises()

    expect(api.downloadSubmissionFile).toHaveBeenCalledWith('assignment-1', 'submission-1', 'file-1')
  })
})
