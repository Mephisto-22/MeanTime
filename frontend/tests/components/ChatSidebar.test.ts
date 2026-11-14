import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import ChatSidebar from '~/components/chat/ChatSidebar.vue'
import Board from '~/components/kanban/Board.vue'
import { kanbanContextKey, type KanbanBoardDto } from '~/api/kanban'
import { chatApi, type MessageOut } from '~/api/chat'
import type { BoardChatComposable } from '~/composables/useBoardChat'
import { useAuthStore } from '~/stores/auth'

const DrawerStub = {
  name: 'Drawer',
  props: ['visible', 'position', 'header', 'modal', 'showCloseIcon'],
  emits: ['update:visible'],
  template: `
    <div v-if="visible" class="p-drawer" data-testid="chat-drawer" :data-show-close-icon="String(showCloseIcon)">
      <div class="p-drawer-header">
        <slot name="header" />
      </div>
      <div class="p-drawer-content">
        <slot />
      </div>
    </div>
  `,
}

const ScrollPanelStub = {
  name: 'ScrollPanel',
  template: `<div class="p-scrollpanel"><slot /></div>`,
}

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header'],
  template: `<div v-if="visible" class="p-dialog"><slot /><slot name="footer" /></div>`,
}

const mockMessages: MessageOut[] = [
  {
    id: 1,
    board_id: 10,
    sender_id: 2,
    sender_name: 'Bob Collaborator',
    content: 'Moving the auth task to In Progress!',
    created_at: '2026-11-13T12:00:00Z',
  },
  {
    id: 2,
    board_id: 10,
    sender_id: 1,
    sender_name: 'Current User',
    content: 'Sounds good, thanks Bob!',
    created_at: '2026-11-13T12:01:00Z',
  },
]

function createMockBoardChat(
  overrides: Partial<{
    messages: MessageOut[]
    isOpen: boolean
    loading: boolean
  }> = {},
): BoardChatComposable {
  const messages = ref<MessageOut[]>(overrides.messages ?? [])
  const isOpen = ref(overrides.isOpen ?? false)
  const loading = ref(overrides.loading ?? false)
  const isPolling = ref(false)

  return {
    messages,
    isOpen,
    loading,
    isPolling,
    loadHistory: vi.fn().mockResolvedValue(undefined),
    pollMessages: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockImplementation(async (text: string) => {
      const msg: MessageOut = {
        id: 99,
        board_id: 10,
        sender_id: 1,
        sender_name: 'Current User',
        content: text,
        created_at: '2026-11-13T12:05:00Z',
      }
      messages.value.push(msg)
      return msg
    }),
    open: vi.fn(() => {
      isOpen.value = true
    }),
    close: vi.fn(() => {
      isOpen.value = false
    }),
    toggle: vi.fn(() => {
      isOpen.value = !isOpen.value
    }),
    stopPolling: vi.fn(),
  }
}

function mountChatSidebar(
  boardChat: BoardChatComposable,
  boardTitle = 'Sprint Planning Board',
) {
  return mount(ChatSidebar, {
    props: {
      boardTitle,
    },
    global: {
      plugins: [PrimeVue, ToastService],
      provide: {
        [kanbanContextKey as symbol]: {
          columns: ref([]),
          moveTask: vi.fn(),
          openCreateTaskDialog: vi.fn(),
          openEditTaskDialog: vi.fn(),
          createTask: vi.fn(),
          updateTask: vi.fn(),
          deleteTask: vi.fn(),
          boardChat,
        },
      },
      stubs: {
        Drawer: DrawerStub,
        ScrollPanel: ScrollPanelStub,
      },
    },
  })
}

describe('Board-Scoped ChatSidebar & Board Integration Suite', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const authStore = useAuthStore()
    authStore.user = {
      id: 1,
      email: 'me@example.com',
      display_name: 'Current User',
      timezone: 'UTC',
      created_at: '2026-01-01T00:00:00Z',
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders floating dock button when drawer is closed and clicking it calls boardChat.open()', async () => {
    const boardChat = createMockBoardChat({ isOpen: false })
    const wrapper = mountChatSidebar(boardChat)

    const dockBtn = wrapper.find('[data-testid="chat-dock-button"]')
    expect(dockBtn.exists()).toBe(true)
    expect(dockBtn.text()).toContain('Chat')

    await dockBtn.trigger('click')
    expect(boardChat.open).toHaveBeenCalledTimes(1)
  })

  it('renders drawer with board title and Live Chat header when boardChat.isOpen is true', () => {
    const boardChat = createMockBoardChat({ isOpen: true })
    const wrapper = mountChatSidebar(boardChat, 'Release v2.0')

    const drawer = wrapper.find('[data-testid="chat-drawer"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.attributes('data-show-close-icon')).toBe('false')
    expect(wrapper.find('[data-testid="active-chat-title"]').text()).toContain(
      'Release v2.0',
    )
    // Verify no legacy Friends/Invite/Clear History elements exist
    expect(wrapper.find('[data-testid="clear-history-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="new-chat-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pending-invites-section"]').exists()).toBe(false)
  })

  it('renders empty state message when board has no chat messages', () => {
    const boardChat = createMockBoardChat({ isOpen: true, messages: [] })
    const wrapper = mountChatSidebar(boardChat)

    expect(wrapper.find('[data-testid="empty-messages-state"]').exists()).toBe(true)
  })

  it('renders message history with sender initials avatar, sender name, timestamp, and own vs collaborator alignment', () => {
    const boardChat = createMockBoardChat({
      isOpen: true,
      messages: [...mockMessages],
    })
    const wrapper = mountChatSidebar(boardChat)

    const items = wrapper.findAll('[data-testid^="message-item-"]')
    expect(items).toHaveLength(2)

    expect(items[0]!.text()).toContain('Bob Collaborator')
    expect(items[0]!.text()).toContain('Moving the auth task to In Progress!')
    expect(items[0]!.classes()).toContain('items-start')

    expect(items[1]!.text()).toContain('Current User')
    expect(items[1]!.text()).toContain('Sounds good, thanks Bob!')
    expect(items[1]!.classes()).toContain('items-end')
  })

  it('sending message via button click or Enter key calls boardChat.sendMessage and clears input', async () => {
    const boardChat = createMockBoardChat({ isOpen: true, messages: [] })
    const wrapper = mountChatSidebar(boardChat)

    const input = wrapper.find('[data-testid="message-input"]')
    await input.setValue(' ship it! ')
    await wrapper.find('[data-testid="send-message-button"]').trigger('click')

    expect(boardChat.sendMessage).toHaveBeenCalledWith('ship it!')
    expect((input.element as HTMLInputElement).value).toBe('')

    await input.setValue('via enter key')
    await input.trigger('keydown.enter')
    expect(boardChat.sendMessage).toHaveBeenCalledWith('via enter key')
  })

  it('disables send button when input is empty or whitespace-only', async () => {
    const boardChat = createMockBoardChat({ isOpen: true })
    const wrapper = mountChatSidebar(boardChat)

    const sendBtn = wrapper.find('[data-testid="send-message-button"]')
    expect((sendBtn.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('[data-testid="message-input"]').setValue('   ')
    expect((sendBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('clicking close button in drawer header calls boardChat.close()', async () => {
    const boardChat = createMockBoardChat({ isOpen: true })
    const wrapper = mountChatSidebar(boardChat)

    await wrapper.find('[data-testid="close-active-sidebar-button"]').trigger('click')
    expect(boardChat.close).toHaveBeenCalledTimes(1)
  })

  it('Board.vue hides Chat button and ChatSidebar when board is not shared (collaborators is empty)', () => {
    const soloBoard: KanbanBoardDto = {
      id: 50,
      title: 'Personal Board',
      description: 'Solo work',
      isOwner: true,
      collaborators: [],
      columns: [],
    }

    const wrapper = mount(Board, {
      props: { board: soloBoard },
      global: {
        plugins: [PrimeVue, ToastService],
        stubs: {
          Drawer: DrawerStub,
          ScrollPanel: ScrollPanelStub,
          Dialog: DialogStub,
        },
      },
    })

    expect(wrapper.find('[data-testid="board-chat-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="chat-dock-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="chat-drawer"]').exists()).toBe(false)
  })

  it('Board.vue renders Chat button and ChatSidebar when board is shared (collaborators.length > 0) and clicking toolbar Chat button toggles drawer', async () => {
    vi.spyOn(chatApi, 'getBoardMessages').mockResolvedValue([...mockMessages])

    const sharedBoard: KanbanBoardDto = {
      id: 51,
      title: 'Team Board',
      description: 'Shared work',
      isOwner: true,
      collaborators: [
        {
          id: 2,
          email: 'bob@example.com',
          display_name: 'Bob Collaborator',
          timezone: 'UTC',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      columns: [],
    }

    const wrapper = mount(Board, {
      props: { board: sharedBoard },
      global: {
        plugins: [PrimeVue, ToastService],
        stubs: {
          Drawer: DrawerStub,
          ScrollPanel: ScrollPanelStub,
          Dialog: DialogStub,
        },
      },
    })

    const chatBtn = wrapper.find('[data-testid="board-chat-button"]')
    expect(chatBtn.exists()).toBe(true)
    expect(wrapper.find('[data-testid="chat-dock-button"]').exists()).toBe(true)

    await chatBtn.trigger('click')
    expect(wrapper.find('[data-testid="chat-drawer"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="active-chat-title"]').text()).toContain(
      'Team Board',
    )
  })
})
