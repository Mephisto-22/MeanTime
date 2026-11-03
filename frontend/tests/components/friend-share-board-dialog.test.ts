import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FriendShareBoardDialog from '~/components/friends/FriendShareBoardDialog.vue'
import { kanbanApi, type KanbanBoardDto } from '~/api/kanban'
import type { UserOut } from '~/api/friends'
import { useAuthStore } from '~/stores/auth'

const targetFriend: UserOut = {
  id: 10,
  display_name: 'Target Friend',
  email: 'target@example.com',
  timezone: 'UTC',
  created_at: '',
}

const mockBoards: KanbanBoardDto[] = [
  {
    id: 1,
    title: 'My Project',
    description: '',
    owner: { id: 5, email: 'me@example.com', display_name: 'Me', timezone: 'UTC', created_at: '' },
    collaborators: [],
    columns: [],
  },
  {
    id: 2,
    title: 'Already Shared',
    description: '',
    owner: { id: 5, email: 'me@example.com', display_name: 'Me', timezone: 'UTC', created_at: '' },
    collaborators: [targetFriend],
    columns: [],
  },
  {
    id: 3,
    title: 'Someone Elses Board',
    description: '',
    owner: { id: 99, email: 'other@example.com', display_name: 'Other', timezone: 'UTC', created_at: '' },
    collaborators: [],
    columns: [],
  },
]

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

function mountDialog() {
  return mount(FriendShareBoardDialog, {
    props: {
      visible: true,
      friend: targetFriend,
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

describe('FriendShareBoardDialog Component Suite', () => {
  beforeEach(() => {
    const auth = useAuthStore()
    auth.user = { id: 5, email: 'me@example.com' } as any
    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(mockBoards)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('filters boards to only owned boards that are not already shared with the friend', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    const select = wrapper.get('[data-testid="board-select"]')
    // Only "My Project" (id: 1) should be an option
    const options = select.findAll('option')
    // 1 placeholder + 1 valid board
    expect(options.length).toBe(2)
    expect(options[1].text()).toContain('My Project')
  })

  it('shares selected board with the friend upon clicking Share', async () => {
    const shareSpy = vi.spyOn(kanbanApi, 'shareBoard').mockResolvedValue({ success: true, message: 'Shared' })
    const wrapper = mountDialog()
    await flushPromises()

    const select = wrapper.get('[data-testid="board-select"]')
    await select.setValue('1')
    await wrapper.get('[data-testid="confirm-share-button"]').trigger('click')
    await flushPromises()

    expect(shareSpy).toHaveBeenCalledWith(1, 10)
    expect(wrapper.emitted('shared')).toBeTruthy()
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
  })
})
