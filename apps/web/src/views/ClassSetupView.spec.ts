import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api, setAdminToken, getAdminToken } = vi.hoisted(() => ({
  api: { currentClass: vi.fn(), listStudents: vi.fn(), listGroups: vi.fn(), importStudents: vi.fn(), deleteStudent: vi.fn(), bootstrap: vi.fn(), createGroups: vi.fn() },
  setAdminToken: vi.fn(),
  getAdminToken: vi.fn(),
}))

vi.mock('../api/client', () => ({ api, setAdminToken, getAdminToken }))
import ClassSetupView from './ClassSetupView.vue'

const routerStubs = { RouterLink: { template: '<a><slot /></a>' }, teleport: true }

const twoStudents = {
  items: [
    { id: 's1', studentNo: '202502110201', name: '卜康怡', groups: [] },
    { id: 's2', studentNo: '202502110202', name: '陈佃兴', groups: [] },
  ],
  total: 2,
}

async function openClassWithStudents(): Promise<ReturnType<typeof mount>> {
  api.currentClass.mockResolvedValue({ classId: 'class-1', name: '计科本2502', studentCount: 2 })
  api.listStudents.mockResolvedValue(twoStudents)
  api.listGroups.mockResolvedValue([])
  const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
  await wrapper.get('input[aria-label="管理密钥"]').setValue('teacher-key')
  await wrapper.get('.teacher-key-form').trigger('submit')
  await flushPromises()
  return wrapper
}

describe('class setup key handling', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getAdminToken.mockReturnValue('')
    api.currentClass.mockResolvedValue(null)
  })

  it('re-enables the management key form after class loading completes', async () => {
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await wrapper.get('input[aria-label="管理密钥"]').setValue('teacher-key')
    await wrapper.get('.teacher-key-form').trigger('submit')
    await flushPromises()

    expect(setAdminToken).toHaveBeenCalledWith('teacher-key')
    expect(wrapper.get('.teacher-key-form button').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('管理密钥已保存')
  })

  it('prevents a management-key refresh from racing an in-flight roster import', async () => {
    api.currentClass.mockResolvedValue({ classId: 'class-1', name: '三年级一班', studentCount: 0 })
    api.listStudents.mockResolvedValue({ items: [], total: 0 })
    api.listGroups.mockResolvedValue([])
    let finishImport!: (value: { created: number; updated: number; rejected: [] }) => void
    api.importStudents.mockReturnValue(new Promise((resolve) => { finishImport = resolve }))
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await wrapper.get('input[aria-label="管理密钥"]').setValue('teacher-key')
    await wrapper.get('.teacher-key-form').trigger('submit')
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === '添加学生')!.trigger('click')
    await flushPromises()
    await wrapper.get('textarea.roster-input').setValue('2026001 张三')
    await wrapper.get('.modal-panel .modal-foot').findAll('button').find((button) => button.text() === '确认导入')!.trigger('click')
    await flushPromises()
    await wrapper.get('.confirm-panel').findAll('button').find((button) => button.text() === '确认导入')!.trigger('click')
    await flushPromises()

    expect(api.importStudents).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.teacher-key-form button').attributes('disabled')).toBeDefined()
    finishImport({ created: 1, updated: 0, rejected: [] })
    api.listStudents.mockResolvedValue({ items: [{ id: 's1', studentNo: '2026001', name: '张三', groups: [] }], total: 1 })
    await flushPromises()

    expect(wrapper.text()).toContain('已新增 1 人')
    expect(wrapper.text()).toContain('1 位学生')
    expect(wrapper.get('.teacher-key-form button').attributes('disabled')).toBeUndefined()
  })

  it('ignores a stale lookup that finishes after a newer key-triggered lookup', async () => {
    let resolveOldLookup!: (value: { classId: string; name: string; studentCount: number } | null) => void
    api.currentClass
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOldLookup = resolve }))
      .mockResolvedValueOnce(null)
    getAdminToken.mockReturnValue('old-key')
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })

    await wrapper.get('input[aria-label="管理密钥"]').setValue('new-key')
    await wrapper.get('.teacher-key-form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('创建唯一班级')

    resolveOldLookup({ classId: 'stale-class', name: '过期班级', studentCount: 99 })
    await flushPromises()

    expect(wrapper.text()).toContain('创建唯一班级')
    expect(wrapper.text()).not.toContain('过期班级')
    expect(api.currentClass).toHaveBeenCalledTimes(2)
  })

  it('shows class creation for the documented null-class result', async () => {
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await wrapper.get('input[aria-label="管理密钥"]').setValue('teacher-key')
    await wrapper.get('.teacher-key-form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('创建唯一班级')
    expect(wrapper.text()).not.toContain('无法读取班级信息')
  })

  it('keeps a failed lookup separate from an uninitialized class and permits retry', async () => {
    api.currentClass.mockRejectedValueOnce(new Error('管理密钥无效')).mockResolvedValueOnce(null)
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await wrapper.get('input[aria-label="管理密钥"]').setValue('teacher-key')
    await wrapper.get('.teacher-key-form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('管理密钥无效')
    expect(wrapper.text()).toContain('重新读取班级信息')
    expect(wrapper.text()).not.toContain('创建唯一班级')

    const retry = wrapper.findAll('button').find((button) => button.text() === '重新读取班级信息')
    expect(retry).toBeDefined()
    await retry!.trigger('click')
    await flushPromises()

    expect(api.currentClass).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('创建唯一班级')
  })

  it('explains an empty roster and keeps member actions unavailable', async () => {
    api.currentClass.mockResolvedValue({ classId: 'class-1', name: '三年级一班', studentCount: 0 })
    api.listStudents.mockResolvedValue({ items: [], total: 0 })
    api.listGroups.mockResolvedValue([])
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await wrapper.get('input[aria-label="管理密钥"]').setValue('teacher-key')
    await wrapper.get('.teacher-key-form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('班级还没有学生')
    expect(wrapper.text()).toContain('添加学生')
    expect(wrapper.findAll('button').find((button) => button.text() === '删除学生')?.attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('button').find((button) => button.text() === '分组')?.attributes('disabled')).toBeDefined()
  })

  it('lists class members with student number and name', async () => {
    const wrapper = await openClassWithStudents()

    const memberList = wrapper.get('ul[aria-label="班级成员列表"]')
    expect(wrapper.text()).toContain('2 位学生')
    expect(memberList.text()).toContain('202502110201')
    expect(memberList.text()).toContain('卜康怡')
    expect(memberList.text()).toContain('陈佃兴')
  })

  it('opens a centered dialog for member actions and closes it from the backdrop', async () => {
    const wrapper = await openClassWithStudents()

    await wrapper.findAll('button').find((button) => button.text() === '添加学生')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.modal-panel[role="dialog"]')
    expect(dialog.attributes('aria-label')).toBe('添加学生')
    expect(wrapper.find('.modal-backdrop').exists()).toBe(true)

    await wrapper.get('.modal-backdrop').trigger('click')
    await flushPromises()
    expect(wrapper.find('.modal-panel[role="dialog"]').exists()).toBe(false)
  })

  it('deletes selected students only after the frosted-glass confirm dialog', async () => {
    const wrapper = await openClassWithStudents()

    await wrapper.findAll('button').find((button) => button.text() === '删除学生')!.trigger('click')
    await flushPromises()
    await wrapper.get('.modal-panel').find('input[value="s1"]').setValue(true)
    await wrapper.get('.modal-panel .modal-foot').findAll('button').find((button) => button.text() === '删除所选')!.trigger('click')
    await flushPromises()

    expect(api.deleteStudent).not.toHaveBeenCalled()
    const confirmPanel = wrapper.get('.confirm-panel[role="alertdialog"]')
    expect(confirmPanel.text()).toContain('确认删除学生')
    expect(confirmPanel.text()).toContain('此操作不可恢复')
    expect(confirmPanel.get('.button.danger-solid').text()).toBe('确认删除')
    expect(confirmPanel.get('.button.ghost').text()).toBe('取消')

    await confirmPanel.get('.button.danger-solid').trigger('click')
    await flushPromises()

    expect(api.deleteStudent).toHaveBeenCalledWith('class-1', 's1')
    expect(wrapper.text()).toContain('已删除 1 名学生')
    expect(wrapper.find('.modal-panel[role="dialog"]').exists()).toBe(false)
  })

  it('keeps the delete dialog open and explains partial failures such as submission restrictions', async () => {
    api.deleteStudent.mockRejectedValueOnce(new Error('该学生已有提交记录，为保证作业统计完整，无法删除。'))
    const wrapper = await openClassWithStudents()

    await wrapper.findAll('button').find((button) => button.text() === '删除学生')!.trigger('click')
    await flushPromises()
    await wrapper.get('.modal-panel').find('input[value="s1"]').setValue(true)
    await wrapper.get('.modal-panel .modal-foot').findAll('button').find((button) => button.text() === '删除所选')!.trigger('click')
    await flushPromises()
    await wrapper.get('.confirm-panel').get('.button.danger-solid').trigger('click')
    await flushPromises()

    expect(api.deleteStudent).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.confirm-panel').exists()).toBe(false)
    expect(wrapper.find('.modal-panel[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('部分学生未删除')
    expect(wrapper.text()).toContain('该学生已有提交记录')
  })

  it('slides a top banner with a red dot after deletion and auto-dismisses it after two seconds', async () => {
    vi.useFakeTimers()
    try {
      api.currentClass.mockResolvedValue({ classId: 'class-1', name: '计科本2502', studentCount: 2 })
      api.listStudents.mockResolvedValue(twoStudents)
      api.listGroups.mockResolvedValue([])
      api.deleteStudent.mockResolvedValue({ removed: true })
      const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
      await wrapper.get('input[aria-label="管理密钥"]').setValue('teacher-key')
      await wrapper.get('.teacher-key-form').trigger('submit')
      await vi.runAllTimersAsync()

      await wrapper.findAll('button').find((button) => button.text() === '删除学生')!.trigger('click')
      await vi.runAllTimersAsync()
      await wrapper.get('.modal-panel').find('input[value="s1"]').setValue(true)
      await wrapper.get('.modal-panel .modal-foot').findAll('button').find((button) => button.text() === '删除所选')!.trigger('click')
      await vi.runAllTimersAsync()
      await wrapper.get('.confirm-panel').get('.button.danger-solid').trigger('click')
      await vi.advanceTimersByTimeAsync(500)

      const banner = wrapper.get('.toast-banner[role="status"]')
      expect(banner.text()).toContain('已删除 1 名学生')
      expect(banner.find('.toast-dot.danger').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(2100)
      expect(wrapper.find('.toast-banner').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a green dot banner after a successful roster import', async () => {
    vi.useFakeTimers()
    try {
      api.currentClass.mockResolvedValue({ classId: 'class-1', name: '计科本2502', studentCount: 0 })
      api.listStudents.mockResolvedValue({ items: [], total: 0 })
      api.listGroups.mockResolvedValue([])
      api.importStudents.mockResolvedValue({ created: 1, updated: 0, rejected: [] })
      const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
      await wrapper.get('input[aria-label="管理密钥"]').setValue('teacher-key')
      await wrapper.get('.teacher-key-form').trigger('submit')
      await vi.runAllTimersAsync()

      await wrapper.findAll('button').find((button) => button.text() === '添加学生')!.trigger('click')
      await vi.runAllTimersAsync()
      await wrapper.get('textarea.roster-input').setValue('2026001 张三')
      await wrapper.get('.modal-panel .modal-foot').findAll('button').find((button) => button.text() === '确认导入')!.trigger('click')
      await vi.runAllTimersAsync()
      await wrapper.get('.confirm-panel').get('.button.danger-solid').trigger('click')
      await vi.advanceTimersByTimeAsync(500)

      const banner = wrapper.get('.toast-banner[role="status"]')
      expect(banner.text()).toContain('已新增 1 人')
      expect(banner.find('.toast-dot.success').exists()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
