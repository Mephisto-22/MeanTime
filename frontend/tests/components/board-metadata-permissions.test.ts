import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BoardCard from '~/components/kanban/BoardCard.vue'
import BoardFormDialog from '~/components/kanban/BoardFormDialog.vue'
import { kanbanApi, type KanbanBoardDto } from '~/api/kanban'
import { useAuthStore } from '~/stores/auth'

const board: KanbanBoardDto = {
  id: 7,
  title: 'Project',
  description: 'Board details',
  columns: [],
  isOwner: false,
  owner: { id: 1, email: 'owner@example.com', display_name: 'Owner', timezone: 'UTC', created_at: '' },
  collaborators: [{ id: 2, email: 'friend@example.com', display_name: 'Friend', timezone: 'UTC', created_at: '', role: 'EDITOR' }],
}

const global = {
  plugins: [PrimeVue, ToastService],
  stubs: { Dialog: { template: '<div><slot /><slot name="footer" /></div>' } },
}

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  useAuthStore().user = { id: 2, email: 'friend@example.com' } as any
})

describe('Board metadata permissions', () => {
  it.each(['EDITOR', 'VIEWER'] as const)('hides editing and blocks form submission for %s', async role => {
    const sharedBoard = { ...board, collaborators: [{ ...board.collaborators![0]!, role }] }
    const card = mount(BoardCard, { props: { board: sharedBoard }, global })
    expect(card.find('[aria-label="Edit Project"]').exists()).toBe(false)

    const update = vi.spyOn(kanbanApi, 'updateBoard')
    const dialog = mount(BoardFormDialog, { props: { board: sharedBoard, visible: true }, global })
    expect(dialog.get('input').attributes('disabled')).toBeDefined()
    expect(dialog.get('textarea').attributes('disabled')).toBeDefined()
    expect(dialog.get('[data-testid="board-save-button"]').attributes('disabled')).toBeDefined()
    await dialog.get('form').trigger('submit')
    expect(update).not.toHaveBeenCalled()
    card.unmount()
    dialog.unmount()
  })

  it('lets the owner open and save board details', async () => {
    useAuthStore().user = { id: 1, email: 'owner@example.com' } as any
    const card = mount(BoardCard, { props: { board }, global })
    await card.get('[aria-label="Edit Project"]').trigger('click')
    expect(card.emitted('edit')).toEqual([[board]])

    const update = vi.spyOn(kanbanApi, 'updateBoard').mockResolvedValue(board)
    const dialog = mount(BoardFormDialog, { props: { board, visible: true }, global })
    await dialog.get('input').setValue('Updated project')
    await dialog.get('form').trigger('submit')
    await flushPromises()
    expect(update).toHaveBeenCalledWith(7, { title: 'Updated project', description: 'Board details' })
    expect(dialog.emitted('saved')).toEqual([[board]])
    card.unmount()
    dialog.unmount()
  })
})
