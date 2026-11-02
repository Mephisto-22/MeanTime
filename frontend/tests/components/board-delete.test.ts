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

  it('asks for confirmation before deleting anything', async () => {
    const remove = vi.spyOn(kanbanApi, 'deleteBoard').mockResolvedValue({ success: true })
    const wrapper = mountDialog({ board })

    await wrapper.get('[data-testid="board-delete-button"]').trigger('click')

    expect(remove).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="board-delete-confirmation"]').text()).toContain('Delete "School"?')
    expect(wrapper.find('[data-testid="board-save-button"]').exists()).toBe(false)
  })

  it('deletes the board after confirming, closes the dialog and tells the page', async () => {
    const toast = vi.spyOn(ToastEventBus, 'emit')
    const remove = vi.spyOn(kanbanApi, 'deleteBoard').mockResolvedValue({ success: true })
    const wrapper = mountDialog({ board })

    await wrapper.get('[data-testid="board-delete-button"]').trigger('click')
    await wrapper.get('[data-testid="board-confirm-delete-button"]').trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('deleted')).toEqual([[board]])
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    expect(toast).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'success', detail: 'Board deleted.' }))
  })

  it('returns to the editor unchanged when the deletion is cancelled', async () => {
    const remove = vi.spyOn(kanbanApi, 'deleteBoard')
    const save = vi.spyOn(kanbanApi, 'updateBoard')
    const wrapper = mountDialog({ board })
    await wrapper.get('input').setValue('School work')

    await wrapper.get('[data-testid="board-delete-button"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[data-testid="board-cancel-delete-button"]').trigger('click')

    expect(remove).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="board-delete-confirmation"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="board-save-button"]').exists()).toBe(true)
    expect(wrapper.get('input').element.value).toBe('School work')
  })

  it('starts on the editor again after being closed mid-confirmation', async () => {
    const wrapper = mountDialog({ board })
    await wrapper.get('[data-testid="board-delete-button"]').trigger('click')

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })

    expect(wrapper.find('[data-testid="board-delete-confirmation"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="board-delete-button"]').exists()).toBe(true)
  })

  it('keeps the dialog open with an error toast when the delete fails', async () => {
    const toast = vi.spyOn(ToastEventBus, 'emit')
    vi.spyOn(kanbanApi, 'deleteBoard').mockRejectedValue(new Error('Delete failed'))
    const wrapper = mountDialog({ board })

    await wrapper.get('[data-testid="board-delete-button"]').trigger('click')
    await wrapper.get('[data-testid="board-confirm-delete-button"]').trigger('click')
    await flushPromises()

    expect(toast).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to delete board', detail: 'Delete failed' }))
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(wrapper.emitted('update:visible')).toBeUndefined()
    expect(wrapper.get('[data-testid="board-confirm-delete-button"]').attributes('disabled')).toBeUndefined()
  })
})
