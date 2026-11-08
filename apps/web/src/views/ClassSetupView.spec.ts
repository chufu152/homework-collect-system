import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { api, setAdminToken } = vi.hoisted(() => ({
  api: { currentClass: vi.fn(), listStudents: vi.fn(), listGroups: vi.fn(), importStudents: vi.fn(), bootstrap: vi.fn(), createGroups: vi.fn() },
  setAdminToken: vi.fn(),
}))

vi.mock('../api/client', () => ({ api, setAdminToken, getAdminToken: () => '' }))
import ClassSetupView from './ClassSetupView.vue'

const routerStubs = { RouterLink: { template: '<a><slot /></a>' } }

describe('class setup key handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
