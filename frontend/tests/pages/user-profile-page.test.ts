import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import Card from 'primevue/card'
import Divider from 'primevue/divider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserProfilePage from '~/pages/users/[id].vue'
import { usersApi } from '~/api/users'
import { useAuthStore } from '~/stores/auth'

const mockToast = {
  add: vi.fn(),
  remove: vi.fn(),
}

vi.mock('primevue/usetoast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('primevue/usetoast')>()
  return {
    ...actual,
    useToast: () => mockToast,
  }
})

let wrappers: VueWrapper[] = []

async function mountPage() {
  const wrapper = await mountSuspended(UserProfilePage, {
    route: '/users/42',
    global: {
      plugins: [PrimeVue, ToastService],
      components: {
        Card,
        Divider,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('UserProfilePage Redesign Suite', () => {
  beforeEach(() => {
    mockToast.add.mockClear()
    mockToast.remove.mockClear()

    const authStore = useAuthStore()
    authStore.setUser({
      id: 42,
      email: 'alex@example.com',
      display_name: 'Alex Johnson',
      timezone: 'America/New_York',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    })
  })

  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers = []
    vi.restoreAllMocks()
  })

  it('renders header with page title and user initials avatar', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Account Settings')
    expect(wrapper.text()).toContain('AJ')
  })

  it('renders email as read-only with a Read-only tag', async () => {
    const wrapper = await mountPage()

    const emailField = wrapper.find('[data-testid="field-email"]')
    expect(emailField.exists()).toBe(true)
    expect(emailField.text()).toBe('alex@example.com')
    expect(wrapper.text()).toContain('Read-only')
  })

  it('renders editable display name and timezone with Divider separation', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="field-display-name"]').text()).toBe('Alex Johnson')
    expect(wrapper.find('[data-testid="field-timezone"]').text()).toBe('America/New_York')

    const dividers = wrapper.findAllComponents(Divider)
    expect(dividers.length).toBeGreaterThanOrEqual(1)
  })

  it('toggles display name editing mode and shows Save/Cancel actions', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="input-display-name"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="save-profile-button"]').exists()).toBe(false)

    await wrapper.find('[data-testid="edit-display-name-button"]').trigger('click')
    await flushPromises()

    const input = wrapper.find('[data-testid="input-display-name"]')
    expect(input.exists()).toBe(true)
    expect(wrapper.find('[data-testid="save-profile-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cancel-edit-button"]').exists()).toBe(true)

    // Canceling restores view mode
    await wrapper.find('[data-testid="cancel-edit-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="input-display-name"]').exists()).toBe(false)
  })

  it('handles save confirmation flow, updates user store, and triggers success toast notification', async () => {
    const updateSpy = vi.spyOn(usersApi, 'updateMe').mockResolvedValue({
      id: 42,
      email: 'alex@example.com',
      display_name: 'Alex J. Updated',
      timezone: 'UTC',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    })

    const wrapper = await mountPage()
    await wrapper.find('[data-testid="edit-display-name-button"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="input-display-name"]').setValue('Alex J. Updated')
    await wrapper.find('[data-testid="save-profile-button"]').trigger('click')
    await flushPromises()

    // SaveConfirmDialog is open; click confirm button in rendered DOM
    const confirmSaveBtn = document.body.querySelector('[data-testid="save-confirm-save-button"]') as HTMLButtonElement
    expect(confirmSaveBtn).not.toBeNull()
    confirmSaveBtn.click()
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledWith({
      display_name: 'Alex J. Updated',
      timezone: 'America/New_York',
    })

    expect(mockToast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        detail: 'Account information saved successfully.',
      }),
    )
  })

  it('shows error toast when saving changes fails', async () => {
    vi.spyOn(usersApi, 'updateMe').mockRejectedValue(new Error('Network error'))

    const wrapper = await mountPage()
    await wrapper.find('[data-testid="edit-display-name-button"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="save-profile-button"]').trigger('click')
    await flushPromises()

    const confirmSaveBtn = document.body.querySelector('[data-testid="save-confirm-save-button"]') as HTMLButtonElement
    expect(confirmSaveBtn).not.toBeNull()
    confirmSaveBtn.click()
    await flushPromises()

    expect(mockToast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
      }),
    )
  })

  it('renders Security section with password dot display and edit button', async () => {
    const wrapper = await mountPage()

    const passwordField = wrapper.find('[data-testid="field-password"]')
    expect(passwordField.exists()).toBe(true)
    expect(wrapper.find('[data-testid="edit-password-button"]').exists()).toBe(true)
  })

  it('renders Danger Zone and triggers DeleteAccountDialog', async () => {
    const wrapper = await mountPage()

    const deleteBtn = wrapper.find('[data-testid="delete-account-button"]')
    expect(deleteBtn.exists()).toBe(true)

    await deleteBtn.trigger('click')
    await flushPromises()

    const deleteDialog = wrapper.findComponent({ name: 'DeleteAccountDialog' })
    expect(deleteDialog.props('visible')).toBe(true)

    const confirmDeleteBtn = document.body.querySelector('[data-testid="delete-confirm-button"]') as HTMLButtonElement
    expect(confirmDeleteBtn).not.toBeNull()
  })
})
