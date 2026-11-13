import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api } = vi.hoisted(() => ({
  api: {
    getPublicAssignment: vi.fn(),
    checkIn: vi.fn(),
    getRelayEntries: vi.fn(),
    joinRelay: vi.fn(),
    submitAssignment: vi.fn(),
    getFormRecord: vi.fn(),
    getFormRoster: vi.fn(),
    submitForm: vi.fn(),
  },
}))

vi.mock('../api/client', () => ({ api }))
import StudentAssignmentView from './StudentAssignmentView.vue'

class FakeApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message)
  }
}

describe('student assignment check-in', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.checkIn).toHaveBeenCalledWith('share-code', { studentName: '张三' })
    expect(wrapper.text()).toContain('签到成功')
    expect(wrapper.text()).toContain('张三')
  })

  it('shows the original successful check-in result when the server reports an idempotent repeat', async () => {
    api.checkIn.mockResolvedValue({
      displayName: '张三', checkedInAt: '2026-11-08T12:00:00.000Z', alreadyCheckedIn: true,
    })
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('张三 已签到，记录时间')
    expect(wrapper.text()).not.toContain('签到成功：张三')
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
    expect(api.submitAssignment).toHaveBeenLastCalledWith('share-code', expect.objectContaining({ studentName: '张三', textContent: '第二版答案' }))
    const secondCall = api.submitAssignment.mock.calls[1] as Array<unknown>
    expect((secondCall[1] as { studentNo?: string }).studentNo).toBeUndefined()
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

    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('input[placeholder="例如：我可以参加"]').setValue('算我一个')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.joinRelay).toHaveBeenCalledWith('share-code', {
      studentName: '张三', content: '算我一个',
    })
    expect(wrapper.text()).toContain('接龙成功，你排在第 2 位。')
    expect(wrapper.text()).toContain('算我一个')
    expect(api.getRelayEntries).toHaveBeenCalledTimes(2)
  })

  it('keeps the assignment available and retries a failed relay-list request in place', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-3', title: '周日接龙', type: 'relay', instructions: '', state: 'published',
      dueAt: null, submissionMode: 'text', allowedFileTypes: [], maxFileCount: 0, maxFileSizeMB: 20,
    })
    api.getRelayEntries.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ items: [], total: 0 })

    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('周日接龙')
    expect(wrapper.text()).toContain('网络连接失败')
    expect(wrapper.text()).not.toContain('暂时无法打开')

    const retry = wrapper.findAll('button').find((button) => button.text() === '重试读取名单')
    expect(retry).toBeDefined()
    await retry!.trigger('click')
    await flushPromises()

    expect(api.getRelayEntries).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('还没有同学加入')
    expect(wrapper.text()).not.toContain('网络连接失败')
  })

  it('explains a repeated relay entry as an already-completed action', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-3', title: '周日接龙', type: 'relay', instructions: '', state: 'published',
      dueAt: null, submissionMode: 'text', allowedFileTypes: [], maxFileCount: 0, maxFileSizeMB: 20,
    })
    api.getRelayEntries.mockResolvedValue({ items: [], total: 0 })
    api.joinRelay.mockRejectedValueOnce(new FakeApiError('Duplicate relay entry.', 'CONFLICT', 409))

    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('input[placeholder="例如：我可以参加"]').setValue('算我一个')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('你已经加入过这次接龙了')
    expect(wrapper.text()).not.toContain('接龙成功')
  })

  it('blocks a submission that exceeds the configured per-file size', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-2', title: '附件作业', type: 'online', instructions: '', state: 'published',
      dueAt: null, submissionMode: 'file', allowedFileTypes: ['pdf'], maxFileCount: 1, maxFileSizeMB: 20,
    })
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    const oversized = new File(['x'], 'large.pdf', { type: 'application/pdf' })
    Object.defineProperty(oversized, 'size', { configurable: true, value: 20 * 1024 * 1024 + 1 })
    const fileInput = wrapper.get('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { configurable: true, value: [oversized] })
    await fileInput.trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('每个文件不能超过 20 MB')
    expect(api.submitAssignment).not.toHaveBeenCalled()
  })

  it('blocks a submission that exceeds the configured attachment count', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-2', title: '附件作业', type: 'online', instructions: '', state: 'published',
      dueAt: null, submissionMode: 'file', allowedFileTypes: ['pdf'], maxFileCount: 1, maxFileSizeMB: 20,
    })
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    const fileInput = wrapper.get('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [
        new File(['a'], 'a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'b.pdf', { type: 'application/pdf' }),
      ],
    })
    await fileInput.trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('最多选择 1 个文件')
    expect(api.submitAssignment).not.toHaveBeenCalled()
  })

  it('disables the submission control while an operation is in flight', async () => {
    api.checkIn.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('form button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('正在处理')
  })

  it('identifies students by name only and lets the server resolve the student number', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-2', title: '周五数学练习', type: 'online', instructions: '', state: 'published',
      dueAt: null, submissionMode: 'text', allowedFileTypes: ['pdf'], maxFileCount: 1, maxFileSizeMB: 20,
    })
    api.submitAssignment.mockResolvedValueOnce({ submissionId: 'sub-9', receiptCode: 'receipt-9', version: 1, submittedAt: '2026-11-08T12:00:00.000Z', files: [] })
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.find('[aria-label="学号"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('系统会按班级名单自动匹配你的学号')

    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.submitAssignment).toHaveBeenCalledWith('share-code', { studentName: '张三', textContent: '', files: [] })
    expect(wrapper.text()).toContain('提交成功')
  })

  it('turns the server-side ambiguous-name rejection into actionable Chinese guidance', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-1', title: '周一签到', type: 'checkin', instructions: '进入教室后签到', state: 'published',
    })
    api.checkIn.mockRejectedValueOnce(new FakeApiError('More than one student has this name. Enter the student number.', 'BAD_REQUEST', 400))
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('班级里有多位同名同学')
    expect(wrapper.text()).not.toContain('More than one student')
  })
it('renders the form sheet and submits one row for a first-time form fill', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-9',
      title: '体温登记',
      type: 'form',
      instructions: '',
      state: 'published',
      form: {
        fields: [
          { name: '体温', type: 'number', required: true },
          { name: '症状', type: 'text', required: false },
        ],
        primaryKey: '体温',
        sortField: null,
        sortDir: 'asc',
      },
    })
    api.getFormRecord.mockResolvedValue({ record: null })
    api.submitForm.mockResolvedValue({ receiptCode: 'r-1', version: 1, updated: false, submittedAt: '2026-11-13T05:00:00.000Z' })
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('信息收集表')
    const sheet = wrapper.get('.form-sheet')
    expect(sheet.findAll('.form-sheet-label').map((node) => node.text())).toEqual(['体温*', '症状'])
    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await sheet.get('#form-field-0').setValue('36.5')
    await sheet.get('#form-field-1').setValue('无')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.submitForm).toHaveBeenCalledWith('share-code', {
      studentName: '张三',
      values: { 体温: '36.5', 症状: '无' },
      files: [],
    })
    expect(wrapper.text()).toContain('提交成功，已记录你的一行数据')
  })

  it('offers roster narrowing dropdowns for studentNo/name fields', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-10',
      title: '值日登记',
      type: 'form',
      instructions: '',
      state: 'published',
      form: {
        fields: [
          { name: '学号', type: 'studentNo', required: true },
          { name: '姓名', type: 'name', required: true },
        ],
        primaryKey: '学号',
        sortField: null,
        sortDir: 'asc',
      },
    })
    api.getFormRoster.mockResolvedValue([
      { studentNo: '202502110201', name: '李一鸣' },
      { studentNo: '202502110203', name: '陈凤迪' },
    ])
    api.getFormRecord.mockResolvedValue({ record: null })
    api.submitForm.mockResolvedValue({ receiptCode: 'r-2', version: 1, updated: false, submittedAt: '2026-11-13T05:00:00.000Z' })
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    const sheet = wrapper.get('.form-sheet')
    // 输入部分学号：候选收窄到一条，另一列显示姓名提示。
    await sheet.get('#form-field-0').setValue('203')
    await sheet.get('#form-field-0').trigger('focus')
    const options = sheet.findAll('.form-dd-list button')
    expect(options).toHaveLength(1)
    expect(options[0].text()).toContain('202502110203')
    expect(options[0].text()).toContain('陈凤迪')
    await options[0].trigger('mousedown')
    await flushPromises()

    expect((sheet.get('#form-field-0').element as HTMLInputElement).value).toBe('202502110203')
    expect(sheet.find('.form-dd-list').exists()).toBe(false)

    // 姓名字段同样可以下拉选。
    await sheet.get('#form-field-1').trigger('focus')
    await sheet.findAll('.form-dd-list button').filter((node) => node.text().includes('陈凤迪'))[0].trigger('mousedown')
    expect((sheet.get('#form-field-1').element as HTMLInputElement).value).toBe('陈凤迪')

    await wrapper.get('[aria-label="姓名"]').setValue('陈凤迪')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.submitForm).toHaveBeenCalledWith('share-code', {
      studentName: '陈凤迪',
      values: { 学号: '202502110203', 姓名: '陈凤迪' },
      files: [],
    })
  })

  it('formats the chosen date with the configured date style', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-11',
      title: '请假登记',
      type: 'form',
      instructions: '',
      state: 'published',
      form: {
        fields: [{ name: '日期', type: 'date', required: true, dateStyle: 'long' }],
        primaryKey: '日期',
        sortField: null,
        sortDir: 'asc',
      },
    })
    api.getFormRecord.mockResolvedValue({ record: null })
    api.getFormRoster.mockResolvedValue([])
    api.submitForm.mockResolvedValue({ receiptCode: 'r-3', version: 1, updated: false, submittedAt: '2026-11-13T05:00:00.000Z' })
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    const dateInput = wrapper.get('input[type="date"]')
    await dateInput.setValue('2026-11-13')
    await dateInput.trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.submitForm).toHaveBeenCalledWith('share-code', {
      studentName: '张三',
      values: { 日期: '2026年11月13日' },
      files: [],
    })
  })

  it('blocks the submit when a required form field is empty', async () => {
    api.getPublicAssignment.mockResolvedValue({
      id: 'assignment-9',
      title: '体温登记',
      type: 'form',
      instructions: '',
      state: 'published',
      form: {
        fields: [{ name: '体温', type: 'number', required: true }],
        primaryKey: '体温',
        sortField: null,
        sortDir: 'asc',
      },
    })
    api.getFormRecord.mockResolvedValue({ record: null })
    const wrapper = mount(StudentAssignmentView, {
      props: { shareCode: 'share-code' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    await wrapper.get('[aria-label="姓名"]').setValue('张三')
    await wrapper.get('form').trigger('submit')
    expect(api.submitForm).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请填写「体温」')
  })
})

