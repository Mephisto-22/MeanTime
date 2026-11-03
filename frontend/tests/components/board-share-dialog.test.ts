import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BoardShareDialog from '~/components/kanban/BoardShareDialog.vue'
import { kanbanApi, type KanbanBoardDto } from '~/api/kanban'
import { friendsApi, type UserOut } from '~/api/friends'
import { useAuthStore } from '~/stores/auth'

const mockOwner: UserOut = {
  id: 1,
  display_name: 'Alice Owner',
  email: 'alice@example.com',
  timezone: 'UTC',
  created_at: '2026-01-01T00:00:00Z',
}

const mockCollaborator: UserOut = {
  id: 2,
  display_name: 'Bob Editor',
  email: 'bob@example.com',
  timezone: 'UTC',
  created_at: '2026-01-02T00:00:00Z',
}

const mockFriend: UserOut = {
  id: 3,
  display_name: 'Charlie Friend',
  email: 'charlie@example.com',
  timezone: 'UTC',
  created_at: '2026-01-03T00:00:00Z',
}

const testBoard: KanbanBoardDto = {
  id: 42,
  title: 'Project Roadmap',
  description: 'Team kanban board',
  owner: mockOwner,
  collaborators: [mockCollaborator],
  columns: [],
}

const SelectStub = {
  name: 'Select',
  props: ['modelValue', 'options', 'optionValue', 'optionLabel', 'disabled', 'placeholder'],
  emits: ['update:modelValue'],
  template: `
    <select
      :value="modelValue ?? ''"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.value === '' || $event.target.value === 'null' ? null : (Number($event.target.value) || $event.target.value))"
    >
      <option value="" disabled>{{ placeholder }}</option>
      <option
        v-for="o in options"
        :key="optionValue ? o[optionValue] : (o.id ?? o.value)"
        :value="optionValue ? o[optionValue] : (o.id ?? o.value)"
      >
        {{ optionLabel ? o[optionLabel] : (o.label ?? o.title) }}
      </option>
    </select>
  `,
}

function mountShareDialog(props: { board?: KanbanBoardDto; visible?: boolean } = {}) {
  return mount(BoardShareDialog, {
    props: {
      visible: true,
      board: testBoard,
      ...props,
    },
    global: {
      plugins: [PrimeVue, ToastService],
      stubs: {
        Dialog: {
          name: 'Dialog',
          props: ['visible', 'header'],
          template: '<div v-if="visible" class="p-dialog" :data-header="header"><slot /><slot name="footer" /></div>',
        },
        Select: SelectStub,
      },
    },
  })
}

describe('BoardShareDialog Component Suite', () => {
  beforeEach(() => {
    vi.spyOn(friendsApi, 'getFriends').mockResolvedValue([mockFriend])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders owner and collaborator details with role badges', async () => {
    const auth = useAuthStore()
    auth.user = { id: 1, email: 'alice@example.com', display_name: 'Alice Owner' } as any

    const wrapper = mountShareDialog()
    await flushPromises()

    expect(wrapper.find('[data-testid="board-owner-row"]').text()).toContain('Alice Owner')
    expect(wrapper.find('[data-testid="board-owner-row"]').text()).toContain('Owner')
    expect(wrapper.find(`[data-testid="collaborator-row-${mockCollaborator.id}"]`).text()).toContain('Bob Editor')
    expect(wrapper.find(`[data-testid="collaborator-row-${mockCollaborator.id}"]`).text()).toContain('Editor')
  })

  it('shows friend search and remove action when current user is board owner', async () => {
    const auth = useAuthStore()
    auth.user = { id: 1, email: 'alice@example.com', display_name: 'Alice Owner' } as any

    const removeSpy = vi.spyOn(kanbanApi, 'removeCollaborator').mockResolvedValue({ success: true, message: 'Revoked' })
    const wrapper = mountShareDialog()
    await flushPromises()

    expect(wrapper.find('[data-testid="invite-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="leave-board-button"]').exists()).toBe(false)

    // Owner can remove collaborator
    const removeBtn = wrapper.find(`[data-testid="remove-collaborator-${mockCollaborator.id}"]`)
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')
    await flushPromises()

    expect(removeSpy).toHaveBeenCalledWith(42, 2)
    expect(wrapper.emitted('collaborators-updated')).toBeTruthy()
  })

  it('allows owner to select and invite an accepted friend', async () => {
    const auth = useAuthStore()
    auth.user = { id: 1, email: 'alice@example.com', display_name: 'Alice Owner' } as any

    const shareSpy = vi.spyOn(kanbanApi, 'shareBoard').mockResolvedValue({ success: true, message: 'Shared' })
    const wrapper = mountShareDialog()
    await flushPromises()

    const select = wrapper.get('[data-testid="friend-select"]')
    await select.setValue(String(mockFriend.id))
    await wrapper.get('[data-testid="invite-friend-button"]').trigger('click')
    await flushPromises()

    expect(shareSpy).toHaveBeenCalledWith(42, mockFriend.id)
    expect(wrapper.emitted('collaborators-updated')).toBeTruthy()
  })

  it('shows Leave Board action with confirmation prompt when user is a collaborator', async () => {
    const auth = useAuthStore()
    auth.user = { id: 2, email: 'bob@example.com', display_name: 'Bob Editor' } as any

    const removeSpy = vi.spyOn(kanbanApi, 'removeCollaborator').mockResolvedValue({ success: true, message: 'Left' })
    const wrapper = mountShareDialog()
    await flushPromises()

    expect(wrapper.find('[data-testid="invite-section"]').exists()).toBe(false)
    expect(wrapper.find(`[data-testid="remove-collaborator-${mockCollaborator.id}"]`).exists()).toBe(false)

    const leaveBtn = wrapper.find('[data-testid="leave-board-button"]')
    expect(leaveBtn.exists()).toBe(true)

    // Click leave board triggers confirmation
    await leaveBtn.trigger('click')
    expect(wrapper.find('[data-testid="leave-board-confirmation"]').exists()).toBe(true)

    // Confirm leaving
    await wrapper.get('[data-testid="confirm-leave-button"]').trigger('click')
    await flushPromises()

    expect(removeSpy).toHaveBeenCalledWith(42, 2)
    expect(wrapper.emitted('left-board')).toBeTruthy()
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
  })
})
