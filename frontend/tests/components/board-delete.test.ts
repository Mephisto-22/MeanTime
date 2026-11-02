import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ToastEventBus from 'primevue/toasteventbus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BoardFormDialog from '~/components/kanban/BoardFormDialog.vue'
import { kanbanApi, type KanbanBoardDto } from '~/api/kanban'

afterEach(() => vi.restoreAllMocks())

const board: KanbanBoardDto = { id: 7, title: 'School', description: '', columns: [] }

function mountDialog(props: { board: KanbanBoardDto | null }) {
  return mount(BoardFormDialog, {
    props: { visible: true, ...props },
    global: {
      plugins: [PrimeVue, ToastService],
      stubs: { Dialog: { template: '<div><slot /><slot name="footer" /></div>' } },
    },
  })
}

describe('Deleting a board from the editor dialog', () => {
  it('offers Delete board only when editing', () => {
    expect(mountDialog({ board }).find('[data-testid="board-delete-button"]').exists()).toBe(true)
    expect(mountDialog({ board: null }).find('[data-testid="board-delete-button"]').exists()).toBe(false)
  })

  it('deletes the board, closes the dialog and tells the page', async () => {
    const toast = vi.spyOn(ToastEventBus, 'emit')
    const remove = vi.spyOn(kanbanApi, 'deleteBoard').mockResolvedValue({ success: true })
    const wrapper = mountDialog({ board })

    await wrapper.get('[data-testid="board-delete-button"]').trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('deleted')).toEqual([[board]])
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    expect(toast).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'success', detail: 'Board deleted.' }))
  })

  it('keeps the dialog open with an error toast when the delete fails', async () => {
    const toast = vi.spyOn(ToastEventBus, 'emit')
    vi.spyOn(kanbanApi, 'deleteBoard').mockRejectedValue(new Error('Delete failed'))
    const wrapper = mountDialog({ board })

    await wrapper.get('[data-testid="board-delete-button"]').trigger('click')
    await flushPromises()

    expect(toast).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to delete board', detail: 'Delete failed' }))
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(wrapper.emitted('update:visible')).toBeUndefined()
    expect(wrapper.get('[data-testid="board-delete-button"]').attributes('disabled')).toBeUndefined()
  })
})
