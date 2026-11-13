import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api, client } = vi.hoisted(() => ({
  api: { importClass: vi.fn(), verifyClassKey: vi.fn(), listStudents: vi.fn(), listGroups: vi.fn(), importStudents: vi.fn(), deleteStudent: vi.fn(), updateStudent: vi.fn(), createGroups: vi.fn() },
  client: {
    addImportedClass: vi.fn(),
    removeImportedClass: vi.fn(),
    listImportedClasses: vi.fn(),
    getActiveClass: vi.fn(),
    setActiveClassId: vi.fn(),
  },
}))

vi.mock('../api/client', () => ({ api, ...client }))
import ClassSetupView from './ClassSetupView.vue'

const routerStubs = { RouterLink: { template: '<a><slot /></a>' }, teleport: true }

const twoStudents = {
  items: [
    { id: 's1', studentNo: '202502110201', name: '卜康怡', groups: [] },
    { id: 's2', studentNo: '202502110202', name: '陈佃兴', groups: [] },
  ],
  total: 2,
}

const entries = {
  classA: { classId: 'class-1', name: '计科本2502', teacherKey: 'teacher-key', studentCount: 2 },
  classB: { classId: 'class-2', name: '三年级一班', teacherKey: 'other-key-1', studentCount: 0 },
}

/** 默认上下文：浏览器里已导入班级 A（活动）与班级 B。 */
function useDefaultClasses(): void {
  let active: typeof entries.classA | null = entries.classA
  client.getActiveClass.mockImplementation(() => active)
  client.listImportedClasses.mockReturnValue([entries.classA, entries.classB])
  client.setActiveClassId.mockImplementation((classId: string) => {
    active = classId === entries.classA.classId ? entries.classA : entries.classB
  })
  client.removeImportedClass.mockImplementation((classId: string) => {
    if (active?.classId === classId) active = null
  })
}

async function openClassWithStudents(): Promise<ReturnType<typeof mount>> {
  useDefaultClasses()
  api.listStudents.mockResolvedValue(twoStudents)
  api.listGroups.mockResolvedValue([])
  const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
  await flushPromises()
  return wrapper
}

describe('class import and switching', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    client.getActiveClass.mockReturnValue(null)
    client.listImportedClasses.mockReturnValue([])
  })

  it('imports a class with a name and key, then shows the toast and re-enables the form', async () => {
    api.importClass.mockResolvedValue({ classId: 'class-new', name: '三年级一班', studentCount: 0 })
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await wrapper.get('input[aria-label="班级名称"]').setValue('三年级一班')
    await wrapper.get('input[aria-label="班级密钥"]').setValue('class-key-2026')
    await wrapper.get('.teacher-key-form').trigger('submit')
    await flushPromises()

    expect(api.importClass).toHaveBeenCalledWith('三年级一班', 'class-key-2026')
    expect(client.addImportedClass).toHaveBeenCalledWith({ classId: 'class-new', name: '三年级一班', teacherKey: 'class-key-2026', studentCount: 0 })
    expect(wrapper.text()).toContain('已导入')
    expect(wrapper.get('.teacher-key-form button').attributes('disabled')).toBeUndefined()
  })

  it('re-imports an existing class with the key alone when no class name is filled', async () => {
    api.verifyClassKey.mockResolvedValue({ classId: 'class-1', name: '计科本2502', studentCount: 29 })
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await wrapper.get('input[aria-label="班级密钥"]').setValue('teacher-key')
    await wrapper.get('.teacher-key-form').trigger('submit')
    await flushPromises()

    expect(api.verifyClassKey).toHaveBeenCalledWith('teacher-key')
    expect(api.importClass).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('导入成功')
  })

  it('explains a failed import and keeps the error message visible', async () => {
    api.importClass.mockRejectedValue(new Error('该班级已存在，密钥不匹配。'))
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await wrapper.get('input[aria-label="班级名称"]').setValue('三年级一班')
    await wrapper.get('input[aria-label="班级密钥"]').setValue('wrong-key-123')
    await wrapper.get('.teacher-key-form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('该班级已存在，密钥不匹配。')
    expect(client.addImportedClass).not.toHaveBeenCalled()
  })

  it('shows the import prompt before any class is imported', async () => {
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('还没有导入任何班级')
    expect(wrapper.text()).not.toContain('无法读取班级信息')
  })

  it('lists imported classes and switches the active one on demand', async () => {
    useDefaultClasses()
    api.listStudents.mockImplementation((classId: string) => Promise.resolve(
      classId === entries.classA.classId ? twoStudents : { items: [], total: 0 }))
    api.listGroups.mockResolvedValue([])
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await flushPromises()

    const list = wrapper.get('ul[aria-label="已导入的班级"]')
    expect(list.text()).toContain('计科本2502')
    expect(list.text()).toContain('三年级一班')

    const switchButton = list.findAll('.class-switch').find((button) => button.text().includes('三年级一班'))!
    await switchButton.trigger('click')
    await flushPromises()

    expect(client.setActiveClassId).toHaveBeenCalledWith('class-2')
    expect(api.listStudents).toHaveBeenCalledWith('class-2')
    expect(wrapper.text()).toContain('班级还没有学生')
  })

  it('keeps roster data intact when a class is removed from this browser', async () => {
    useDefaultClasses()
    api.listStudents.mockResolvedValue(twoStudents)
    api.listGroups.mockResolvedValue([])
    const wrapper = await openClassWithStudents()

    const removeButton = wrapper.get('ul[aria-label="已导入的班级"]').findAll('.class-remove')[0]
    await removeButton.trigger('click')
    await flushPromises()

    expect(client.removeImportedClass).toHaveBeenCalledWith('class-1')
    expect(wrapper.text()).toContain('还没有导入任何班级')
  })

  it('prevents an import action from racing an in-flight roster import', async () => {
    useDefaultClasses()
    api.listStudents.mockResolvedValue({ items: [], total: 0 })
    api.listGroups.mockResolvedValue([])
    let finishImport!: (value: { created: number; updated: number; rejected: [] }) => void
    api.importStudents.mockReturnValue(new Promise((resolve) => { finishImport = resolve }))
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
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

  it('keeps a failed roster lookup separate from a missing class and permits retry', async () => {
    useDefaultClasses()
    api.listStudents.mockRejectedValueOnce(new Error('管理密钥无效')).mockResolvedValueOnce({ items: [], total: 0 })
    api.listGroups.mockResolvedValue([])
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('管理密钥无效')
    expect(wrapper.text()).toContain('重新读取班级信息')
    expect(wrapper.text()).not.toContain('还没有导入任何班级')

    const retry = wrapper.findAll('button').find((button) => button.text() === '重新读取班级信息')
    expect(retry).toBeDefined()
    await retry!.trigger('click')
    await flushPromises()

    expect(api.listStudents).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('班级还没有学生')
  })

  it('explains an empty roster and keeps member actions unavailable', async () => {
    useDefaultClasses()
    api.listStudents.mockResolvedValue({ items: [], total: 0 })
    api.listGroups.mockResolvedValue([])
    const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
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

  it('edits a student number and name individually through the row edit button', async () => {
    api.updateStudent.mockResolvedValue({ id: 's2', studentNo: '202502110202', name: '陈凤迪' })
    const wrapper = await openClassWithStudents()

    const editButton = wrapper.findAll('button.member-edit')[1]
    await editButton.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.modal-panel[role="dialog"]')
    expect(dialog.attributes('aria-label')).toBe('修改学生信息')
    const inputs = dialog.findAll('input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('202502110202')
    expect((inputs[1].element as HTMLInputElement).value).toBe('陈佃兴')

    await inputs[1].setValue('陈凤迪')
    await dialog.get('.modal-foot').findAll('button').find((button) => button.text() === '保存修改')!.trigger('click')
    await flushPromises()

    expect(api.updateStudent).toHaveBeenCalledWith('class-1', 's2', { name: '陈凤迪' })
    const memberList = wrapper.get('ul[aria-label="班级成员列表"]')
    expect(memberList.text()).toContain('陈凤迪')
    expect(wrapper.text()).toContain('已修改学生信息')
    expect(wrapper.find('.modal-panel[role="dialog"]').exists()).toBe(false)
  })

  it('rejects an unchanged edit without calling the api', async () => {
    const wrapper = await openClassWithStudents()

    await wrapper.findAll('button.member-edit')[0].trigger('click')
    await flushPromises()
    await wrapper.get('.modal-panel').get('.modal-foot').findAll('button').find((button) => button.text() === '保存修改')!.trigger('click')
    await flushPromises()

    expect(api.updateStudent).not.toHaveBeenCalled()
    expect(wrapper.find('.modal-panel[role="dialog"]').exists()).toBe(false)
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
      useDefaultClasses()
      api.listStudents.mockResolvedValue(twoStudents)
      api.listGroups.mockResolvedValue([])
      api.deleteStudent.mockResolvedValue({ removed: true })
      const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
      await flushPromises()

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
      useDefaultClasses()
      api.listStudents.mockResolvedValue({ items: [], total: 0 })
      api.listGroups.mockResolvedValue([])
      api.importStudents.mockResolvedValue({ created: 1, updated: 0, rejected: [] })
      const wrapper = mount(ClassSetupView, { global: { stubs: routerStubs } })
      await flushPromises()

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
