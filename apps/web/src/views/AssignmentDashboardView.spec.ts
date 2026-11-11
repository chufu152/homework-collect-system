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
    listSubmissionVersions: vi.fn(),
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

function buttonWithText(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`button not found: ${label}`)
  return button
}

describe('teacher dashboard submission review', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.dashboard.mockResolvedValue(dashboard)
    api.downloadSubmissionFile.mockResolvedValue(undefined)
    api.exportFile.mockResolvedValue(undefined)
    api.listSubmissionVersions.mockResolvedValue({
      submissionId: 'submission-1',
      currentVersion: 2,
      items: [
        {
          version: 2, submittedAt: '2026-11-08T12:00:00.000Z', textContent: '答案：43',
          files: [{ id: 'file-1', originalName: 'answer.pdf', contentType: 'application/pdf', sizeBytes: 2048 }],
        },
        {
          version: 1, submittedAt: '2026-11-08T10:00:00.000Z', textContent: '答案：42',
          files: [{ id: 'file-v1', originalName: 'answer-v1.pdf', contentType: 'application/pdf', sizeBytes: 1024 }],
        },
      ],
    })
  })

  it('shows the submitted text and downloads an attachment with the teacher key', async () => {
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('答案：42')
    expect(wrapper.text()).toContain('answer.pdf')
    expect(wrapper.text()).toContain('尚未提交')
    expect(wrapper.text()).toContain('尚未批改')

    const attachmentButtons = wrapper.findAll('.submission-files .button')
    await attachmentButtons[0].trigger('click')
    await flushPromises()

    expect(api.downloadSubmissionFile).toHaveBeenCalledWith('assignment-1', 'submission-1', 'file-1')
  })

  it('exports the CSV roster, ZIP archive and a single-submission DOCX', async () => {
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    await buttonWithText(wrapper, '导出名单 CSV').trigger('click')
    await buttonWithText(wrapper, '导出提交文件 ZIP').trigger('click')
    await buttonWithText(wrapper, '导出 Word').trigger('click')
    await flushPromises()

    expect(api.exportFile).toHaveBeenCalledWith('assignment-1', 'csv', undefined)
    expect(api.exportFile).toHaveBeenCalledWith('assignment-1', 'zip', undefined)
    expect(api.exportFile).toHaveBeenCalledWith('assignment-1', 'docx', 'submission-1')
    expect(wrapper.text()).not.toContain('导出失败')
  })

  it('prevents a second identical export while the first export is still running', async () => {
    api.exportFile.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    const exportButton = buttonWithText(wrapper, '导出名单 CSV')
    await exportButton.trigger('click')
    await flushPromises()

    expect(api.exportFile).toHaveBeenCalledTimes(1)
    expect(exportButton.attributes('disabled')).toBeDefined()
    expect(exportButton.text()).toContain('正在导出')
  })

  it('explains when a dashboard has no target students', async () => {
    api.dashboard.mockResolvedValue({
      ...dashboard,
      summary: { expected: 0, submitted: 0, missing: 0, late: 0 },
      missingMentionText: '',
      items: [],
    })
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('这项作业还没有目标学生')
    expect(wrapper.text()).toContain('导入名单后重新发布')
    expect(wrapper.findAll('.student-table tbody tr')).toHaveLength(0)
    expect(wrapper.findAll('.mobile-student-row')).toHaveLength(0)
  })

  it('distinguishes a text-only submission from one that has attachments', async () => {
    api.dashboard.mockResolvedValue({
      ...dashboard,
      items: [{ ...dashboard.items[0], files: [] }, dashboard.items[1]],
    })
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    await wrapper.find('.student-table .submission-detail summary').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('当前提交版本没有附件')

    // C1：手机布局走 .mobile-student-list，同一空附件提示必须同样可见。
    const mobileDetail = wrapper.find('.mobile-student-row .submission-detail')
    expect(mobileDetail.exists()).toBe(true)
    await mobileDetail.find('summary').trigger('click')
    await flushPromises()
    expect(mobileDetail.text()).toContain('当前提交版本没有附件')
    expect(mobileDetail.findAll('.submission-files li')).toHaveLength(0)
  })

  it('shows a recoverable message when a binary export fails at the network layer', async () => {
    api.exportFile.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    await buttonWithText(wrapper, '导出名单 CSV').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('网络连接失败')
    expect(wrapper.text()).toContain('检查网络后重试')
  })

  it('shows the differentiated rate-limit copy when an export is throttled', async () => {
    // C3：导出端点失败时客户端已解析错误信封，429 走 T8 差异化文案并带重试秒数。
    const throttled = Object.assign(new Error('请求过于频繁。'), { code: 'RATE_LIMITED', status: 429, retryAfter: 23 })
    api.exportFile.mockRejectedValueOnce(throttled)
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    await buttonWithText(wrapper, '导出名单 CSV').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('操作太频繁')
    expect(wrapper.text()).toContain('23 秒后重试')
  })

  it('loads submission versions on demand and downloads a historical attachment', async () => {
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(api.listSubmissionVersions).not.toHaveBeenCalled()

    await buttonWithText(wrapper, '查看历次修改').trigger('click')
    await flushPromises()

    expect(api.listSubmissionVersions).toHaveBeenCalledWith('submission-1')
    expect(wrapper.text()).toContain('第 1 版')
    expect(wrapper.text()).toContain('answer-v1.pdf')
    expect(buttonWithText(wrapper, '刷新历次修改')).toBeDefined()

    const historical = wrapper.findAll('.version-history .submission-files .button')
      .find((candidate) => candidate.text() === 'answer-v1.pdf')
    expect(historical).toBeDefined()
    await historical!.trigger('click')
    await flushPromises()

    expect(api.downloadSubmissionFile).toHaveBeenCalledWith('assignment-1', 'submission-1', 'file-v1')
  })

  it('shows a recoverable error when version history cannot be loaded', async () => {
    api.listSubmissionVersions.mockRejectedValueOnce(new Error('历次修改暂时无法读取'))
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    await buttonWithText(wrapper, '查看历次修改').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('历次修改暂时无法读取')
    expect(wrapper.findAll('.version-history .error-text').length).toBeGreaterThan(0)
    expect(api.downloadSubmissionFile).not.toHaveBeenCalled()
  })

  it('explains an empty version history', async () => {
    api.listSubmissionVersions.mockResolvedValue({ submissionId: 'submission-1', currentVersion: 1, items: [] })
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    await buttonWithText(wrapper, '查看历次修改').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('这项目前只有一版提交；重新提交后才会出现历次修改。')
    expect(wrapper.findAll('.version-history [role="status"]').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.version-history .error-text').length).toBe(0)
    expect(wrapper.text()).not.toContain('第 1 版')
  })

  it('recovers when a failed version-history load is retried', async () => {
    api.listSubmissionVersions.mockRejectedValueOnce(new Error('历次修改暂时无法读取'))
    const wrapper = mount(AssignmentDashboardView, {
      props: { assignmentId: 'assignment-1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    await buttonWithText(wrapper, '查看历次修改').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('历次修改暂时无法读取')

    await buttonWithText(wrapper, '查看历次修改').trigger('click')
    await flushPromises()

    expect(api.listSubmissionVersions).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('第 1 版')
    expect(wrapper.text()).not.toContain('历次修改暂时无法读取')
  })
})
