import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserSearch from '~/components/friends/UserSearch.vue'
import { friendsApi, type UserSearchResultOut } from '~/api/friends'
import { useAuthStore } from '~/stores/auth'

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header'],
  template: `
    <div v-if="visible" class="p-dialog" :data-header="header">
      <slot />
      <slot name="footer" />
    </div>
  `,
}

const mockCurrentUser = {
  id: 99,
  email: 'currentuser@example.com',
  display_name: 'Current User',
  timezone: 'America/New_York',
  created_at: '2026-01-01T00:00:00Z',
}

const mockResults: UserSearchResultOut[] = [
  {
    id: 1,
    display_name: 'Alice Cooper',
    email: 'alice@example.com',
    timezone: 'America/Chicago',
    relationship_status: 'none',
  },
  {
    id: 2,
    display_name: 'Bob Builder',
    email: 'bob@example.com',
    timezone: 'Europe/London',
    relationship_status: 'friend',
  },
  {
    id: 3,
    display_name: 'Charlie Chaplin',
    email: 'charlie@example.com',
    timezone: 'UTC',
    relationship_status: 'pending_incoming',
  },
  {
    id: 4,
    display_name: 'David Bowie',
    email: 'david@example.com',
    timezone: 'America/Los_Angeles',
    relationship_status: 'pending_outgoing',
  },
]

function mountUserSearch() {
  return mount(UserSearch, {
    global: {
      plugins: [PrimeVue],
      stubs: {
        Dialog: DialogStub,
      },
    },
  })
}

describe('UserSearch Component Suite', () => {
  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore()
    authStore.setUser(mockCurrentUser)
    vi.restoreAllMocks()
  })

  describe('Input validation and query trimming', () => {
    it('disables search button when input query is empty or whitespace', async () => {
      const wrapper = mountUserSearch()
      const searchButton = wrapper.find('[data-testid="user-search-button"]')
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      // Empty input
      expect(searchButton.attributes('disabled')).toBeDefined()

      // Whitespace only
      await searchInput.setValue('   ')
      expect(searchButton.attributes('disabled')).toBeDefined()

      // Non-empty
      await searchInput.setValue('alice')
      expect(searchButton.attributes('disabled')).toBeUndefined()
    })

    it('does not trigger friendsApi.searchUser when input is empty or whitespace on submit', async () => {
      const searchSpy = vi.spyOn(friendsApi, 'searchUser').mockResolvedValue([])
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('   ')
      await searchInput.trigger('keydown.enter')

      expect(searchSpy).not.toHaveBeenCalled()
    })
  })

  describe('Self-search email check', () => {
    it('displays self-search alert "This is your email address" and does not call search when searching own email', async () => {
      const searchSpy = vi.spyOn(friendsApi, 'searchUser').mockResolvedValue([])
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')
      const searchButton = wrapper.find('[data-testid="user-search-button"]')

      await searchInput.setValue('  currentuser@example.com  ')
      await searchButton.trigger('click')
      await flushPromises()

      expect(searchSpy).not.toHaveBeenCalled()
      const alert = wrapper.find('[data-testid="self-search-alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('This is your email address')
      expect(wrapper.findAll('[data-testid="search-result-card"]').length).toBe(0)
    })

    it('matches current user email case-insensitively', async () => {
      const searchSpy = vi.spyOn(friendsApi, 'searchUser').mockResolvedValue([])
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('CURRENTUSER@EXAMPLE.COM')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      expect(searchSpy).not.toHaveBeenCalled()
      const alert = wrapper.find('[data-testid="self-search-alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('This is your email address')
    })
  })

  describe('Search submission and API integration', () => {
    it('calls friendsApi.searchUser with trimmed query on submit and clears self-search alert', async () => {
      const searchSpy = vi.spyOn(friendsApi, 'searchUser').mockResolvedValue(mockResults)
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')
      const searchButton = wrapper.find('[data-testid="user-search-button"]')

      await searchInput.setValue('  someone@example.com  ')
      await searchButton.trigger('click')
      await flushPromises()

      expect(searchSpy).toHaveBeenCalledTimes(1)
      expect(searchSpy).toHaveBeenCalledWith('someone@example.com')
      expect(wrapper.find('[data-testid="self-search-alert"]').exists()).toBe(false)
    })

    it('renders result cards for multiple returned users', async () => {
      vi.spyOn(friendsApi, 'searchUser').mockResolvedValue(mockResults)
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('user')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      const cards = wrapper.findAll('[data-testid="search-result-card"]')
      expect(cards.length).toBe(4)

      // First card details
      const firstCard = cards[0]
      expect(firstCard.find('[data-testid="user-name"]').text()).toBe('Alice Cooper')
      expect(firstCard.find('[data-testid="user-email"]').text()).toBe('alice@example.com')
      expect(firstCard.find('[data-testid="user-timezone"]').text()).toContain('America/Chicago')
      expect(firstCard.find('[data-testid="user-avatar"]').text()).toBe('AC')
    })

    it('renders empty state when no users are found matching query', async () => {
      vi.spyOn(friendsApi, 'searchUser').mockResolvedValue([])
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('nobody')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      const emptyState = wrapper.find('[data-testid="search-empty-state"]')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain("No user found matching 'nobody'. Please verify the exact email or username.")
      expect(wrapper.findAll('[data-testid="search-result-card"]').length).toBe(0)
    })

    it('displays error message when search API fails', async () => {
      vi.spyOn(friendsApi, 'searchUser').mockRejectedValue(new Error('Search service unreachable'))
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('alice')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      const errorAlert = wrapper.find('[data-testid="search-error"]')
      expect(errorAlert.exists()).toBe(true)
      expect(errorAlert.text()).toContain('Search service unreachable')
      expect(wrapper.findAll('[data-testid="search-result-card"]').length).toBe(0)
    })
  })

  describe('Relationship status controls and action emits', () => {
    it('handles relationship_status === "none": shows Send Friend Request and Block User buttons and emits send-request', async () => {
      vi.spyOn(friendsApi, 'searchUser').mockResolvedValue([mockResults[0]]) // Alice: status none
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('alice')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      const sendBtn = wrapper.find('[data-testid="send-request-button-1"]')
      const blockBtn = wrapper.find('[data-testid="block-button-1"]')

      expect(sendBtn.exists()).toBe(true)
      expect(sendBtn.text()).toContain('Send Friend Request')
      expect(blockBtn.exists()).toBe(true)
      expect(blockBtn.text()).toContain('Block User')

      await sendBtn.trigger('click')
      expect(wrapper.emitted('send-request')).toBeTruthy()
      expect(wrapper.emitted('send-request')![0]).toEqual([1])
    })

    it('handles relationship_status === "friend": shows Friends tag and Unfriend button and emits unfriend on confirmation', async () => {
      vi.spyOn(friendsApi, 'searchUser').mockResolvedValue([mockResults[1]]) // Bob: status friend
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('bob')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      const friendTag = wrapper.find('[data-testid="friend-tag-2"]')
      const unfriendBtn = wrapper.find('[data-testid="unfriend-button-2"]')

      expect(friendTag.exists()).toBe(true)
      expect(friendTag.text()).toContain('Friends')
      expect(unfriendBtn.exists()).toBe(true)
      expect(unfriendBtn.text()).toContain('Unfriend')

      // Click Unfriend -> Opens confirmation dialog
      await unfriendBtn.trigger('click')
      const unfriendDialog = wrapper.find('[data-testid="unfriend-confirm-dialog"]')
      expect(unfriendDialog.exists()).toBe(true)
      expect(unfriendDialog.text()).toContain('Bob Builder')

      // Cancel dismisses without emitting
      await wrapper.find('[data-testid="cancel-unfriend-button"]').trigger('click')
      expect(wrapper.find('[data-testid="unfriend-confirm-dialog"]').exists()).toBe(false)
      expect(wrapper.emitted('unfriend')).toBeFalsy()

      // Confirm emits unfriend with userId
      await unfriendBtn.trigger('click')
      await wrapper.find('[data-testid="confirm-unfriend-button"]').trigger('click')
      expect(wrapper.emitted('unfriend')).toBeTruthy()
      expect(wrapper.emitted('unfriend')![0]).toEqual([2])
      expect(wrapper.find('[data-testid="unfriend-confirm-dialog"]').exists()).toBe(false)
    })

    it('handles relationship_status === "pending_incoming": shows Accept and Decline buttons and emits corresponding events', async () => {
      vi.spyOn(friendsApi, 'searchUser').mockResolvedValue([mockResults[2]]) // Charlie: pending_incoming
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('charlie')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      const acceptBtn = wrapper.find('[data-testid="accept-request-button-3"]')
      const declineBtn = wrapper.find('[data-testid="decline-request-button-3"]')

      expect(acceptBtn.exists()).toBe(true)
      expect(acceptBtn.text()).toContain('Accept')
      expect(declineBtn.exists()).toBe(true)
      expect(declineBtn.text()).toContain('Decline')

      await acceptBtn.trigger('click')
      expect(wrapper.emitted('accept-request')).toBeTruthy()
      expect(wrapper.emitted('accept-request')![0]).toEqual([3])

      await declineBtn.trigger('click')
      expect(wrapper.emitted('decline-request')).toBeTruthy()
      expect(wrapper.emitted('decline-request')![0]).toEqual([3])
    })

    it('handles relationship_status === "pending_outgoing": shows Request Sent tag and Cancel Request button and emits cancel-request', async () => {
      vi.spyOn(friendsApi, 'searchUser').mockResolvedValue([mockResults[3]]) // David: pending_outgoing
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('david')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      const sentTag = wrapper.find('[data-testid="request-sent-tag-4"]')
      const cancelBtn = wrapper.find('[data-testid="cancel-request-button-4"]')

      expect(sentTag.exists()).toBe(true)
      expect(sentTag.text()).toContain('Request Sent')
      expect(cancelBtn.exists()).toBe(true)
      expect(cancelBtn.text()).toContain('Cancel Request')

      await cancelBtn.trigger('click')
      expect(wrapper.emitted('cancel-request')).toBeTruthy()
      expect(wrapper.emitted('cancel-request')![0]).toEqual([4])
    })

    it('handles block flow: opens block confirmation dialog and emits block on confirmation', async () => {
      vi.spyOn(friendsApi, 'searchUser').mockResolvedValue([mockResults[0]]) // Alice: status none
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('alice')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      const blockBtn = wrapper.find('[data-testid="block-button-1"]')
      await blockBtn.trigger('click')

      const blockDialog = wrapper.find('[data-testid="block-confirm-dialog"]')
      expect(blockDialog.exists()).toBe(true)
      expect(blockDialog.text()).toContain('Alice Cooper')

      // Cancel dismisses without emitting
      await wrapper.find('[data-testid="cancel-block-button"]').trigger('click')
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(false)
      expect(wrapper.emitted('block')).toBeFalsy()

      // Confirm emits block with userId
      await blockBtn.trigger('click')
      await wrapper.find('[data-testid="confirm-block-button"]').trigger('click')
      expect(wrapper.emitted('block')).toBeTruthy()
      expect(wrapper.emitted('block')![0]).toEqual([1])
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(false)
    })
  })

  describe('Search clearing', () => {
    it('clears query and resets search state when clicking clear button', async () => {
      vi.spyOn(friendsApi, 'searchUser').mockResolvedValue(mockResults)
      const wrapper = mountUserSearch()
      const searchInput = wrapper.find('[data-testid="user-search-input"]')

      await searchInput.setValue('alice')
      await searchInput.trigger('keydown.enter')
      await flushPromises()

      expect(wrapper.findAll('[data-testid="search-result-card"]').length).toBe(4)

      const clearBtn = wrapper.find('[data-testid="clear-search-button"]')
      expect(clearBtn.exists()).toBe(true)
      await clearBtn.trigger('click')

      expect(wrapper.findAll('[data-testid="search-result-card"]').length).toBe(0)
      expect(wrapper.find('[data-testid="search-empty-state"]').exists()).toBe(false)
      expect((wrapper.find('[data-testid="user-search-input"]').element as HTMLInputElement).value).toBe('')
    })
  })
})
