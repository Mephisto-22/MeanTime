import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BoardPage from '~/pages/boards/[id].vue'
import { kanbanApi, type KanbanBoardDto } from '~/api/kanban'

const mockBoard: KanbanBoardDto = {
  id: 12,
  title: 'Sprint Planning',
  description: 'Shared board',
  owner: { id: 1, email: 'owner@example.com', display_name: 'Owner', timezone: 'UTC', created_at: '' },
  collaborators: [
    { id: 2, email: 'collab@example.com', display_name: 'Collab', timezone: 'UTC', created_at: '' },
  ],
  columns: [],
}

describe('Board Page ([id].vue)', () => {
  beforeEach(() => {
    vi.spyOn(kanbanApi, 'getBoard').mockResolvedValue(mockBoard)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders Share button and collaborators preview', async () => {
    const wrapper = await mountSuspended(BoardPage, {
      route: '/boards/12',
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="board-share-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="collaborators-preview"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="back-to-boards"]').exists()).toBe(false)
  })
})
