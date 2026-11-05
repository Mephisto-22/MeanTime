import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import Fieldset from 'primevue/fieldset'
import Divider from 'primevue/divider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserProfilePage from '~/pages/users/[id].vue'
import { usersApi } from '~/api/users'
import { useAuthStore } from '~/stores/auth'

let wrappers: VueWrapper[] = []

async function mountPage() {
  const wrapper = await mountSuspended(UserProfilePage, {
    route: '/users/42',
    global: {
      plugins: [PrimeVue, ToastService],
      components: {
        Fieldset,
        Divider,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('UserProfilePage Semantic Decomposition & Fieldsets Suite', () => {
  beforeEach(() => {
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

  it('renders semantic Fieldset containers for all four sections with canonical legends', async () => {
    const wrapper = await mountPage()

    const fieldsets = wrapper.findAllComponents(Fieldset)
    expect(fieldsets.length).toBe(4)

    const legends = fieldsets.map((f) => f.props('legend'))
    expect(legends).toEqual([
      'Account Information',
      'Preferences',
      'Security',
      'Danger Zone',
    ])
  })

  it('renders email as read-only with a Read-only tag in Account Information', async () => {
    const wrapper = await mountPage()

    const emailField = wrapper.find('[data-testid="field-email"]')
    expect(emailField.exists()).toBe(true)
    expect(emailField.text()).toBe('alex@example.com')

    const fieldsets = wrapper.findAllComponents(Fieldset)
    const accountInfoFieldset = fieldsets[0]
    expect(accountInfoFieldset.text()).toContain('Read-only')
    expect(accountInfoFieldset.find('[data-testid="edit-display-name-button"]').exists()).toBe(false)
  })

  it('renders editable display name and timezone in Preferences with Divider separation', async () => {
    const wrapper = await mountPage()

    const fieldsets = wrapper.findAllComponents(Fieldset)
    const preferencesFieldset = fieldsets[1]

    expect(preferencesFieldset.find('[data-testid="field-display-name"]').text()).toBe('Alex Johnson')
    expect(preferencesFieldset.find('[data-testid="field-timezone"]').text()).toBe('America/New_York')

    const dividers = preferencesFieldset.findAllComponents(Divider)
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

  it('handles save confirmation flow and updates user store upon success', async () => {
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

    const successMessage = wrapper.find('[data-testid="profile-save-success"]')
    expect(successMessage.exists()).toBe(true)
    expect(successMessage.text()).toContain('saved successfully')
  })

  it('renders Security fieldset with password dot display and edit button', async () => {
    const wrapper = await mountPage()

    const fieldsets = wrapper.findAllComponents(Fieldset)
    const securityFieldset = fieldsets[2]

    const passwordField = securityFieldset.find('[data-testid="field-password"]')
    expect(passwordField.exists()).toBe(true)
    expect(securityFieldset.find('[data-testid="edit-password-button"]').exists()).toBe(true)
  })

  it('renders Danger Zone fieldset and triggers DeleteAccountDialog', async () => {
    const wrapper = await mountPage()

    const fieldsets = wrapper.findAllComponents(Fieldset)
    const dangerFieldset = fieldsets[3]

    const deleteBtn = dangerFieldset.find('[data-testid="delete-account-button"]')
    expect(deleteBtn.exists()).toBe(true)

    await deleteBtn.trigger('click')
    await flushPromises()

    const deleteDialog = wrapper.findComponent({ name: 'DeleteAccountDialog' })
    expect(deleteDialog.props('visible')).toBe(true)

    const confirmDeleteBtn = document.body.querySelector('[data-testid="delete-confirm-button"]') as HTMLButtonElement
    expect(confirmDeleteBtn).not.toBeNull()
  })
})
