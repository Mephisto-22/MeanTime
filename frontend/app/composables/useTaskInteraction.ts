import { ref, inject, hasInjectionContext, type Ref } from 'vue'
import type { KanbanTaskDto } from '~/api/kanban'
import { kanbanContextKey } from '~/api/kanban'

export interface TaskInteractionOptions {
  onOpenEdit?: (task: KanbanTaskDto) => void
}

export function useTaskInteraction(
  task: KanbanTaskDto | Ref<KanbanTaskDto> | (() => KanbanTaskDto),
  optionsOrCustomOpenEdit?: ((task: KanbanTaskDto) => void) | TaskInteractionOptions,
) {
  const kanbanContext = hasInjectionContext() ? inject(kanbanContextKey, null) : null

  const DRAG_THRESHOLD_PX = 5
  const isDragging = ref(false)
  let startX = 0
  let startY = 0
  let dragEndTimeout: ReturnType<typeof setTimeout> | null = null

  const getTask = (): KanbanTaskDto => {
    if (typeof task === 'function') {
      return task()
    }
    if (task && typeof task === 'object' && 'value' in task) {
      return (task as Ref<KanbanTaskDto>).value
    }
    return task
  }

  const getCustomOpenEdit = (): ((task: KanbanTaskDto) => void) | undefined => {
    if (typeof optionsOrCustomOpenEdit === 'function') {
      return optionsOrCustomOpenEdit
    }
    return optionsOrCustomOpenEdit?.onOpenEdit
  }

  const handlePointerDown = (event?: PointerEvent | MouseEvent) => {
    startX = event?.clientX ?? 0
    startY = event?.clientY ?? 0
    isDragging.value = false
  }

  const handlePointerMove = (event?: PointerEvent | MouseEvent) => {
    if (event && 'buttons' in event && event.buttons === 0) return
    const currentX = event?.clientX ?? 0
    const currentY = event?.clientY ?? 0
    const deltaX = Math.abs(currentX - startX)
    const deltaY = Math.abs(currentY - startY)
    if (Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD_PX) {
      isDragging.value = true
    }
  }

  const handleDragStart = () => {
    isDragging.value = true
  }

  const handleDragEnd = () => {
    if (dragEndTimeout) clearTimeout(dragEndTimeout)
    dragEndTimeout = setTimeout(() => {
      isDragging.value = false
    }, 100)
  }

  const handleClick = (event?: MouseEvent) => {
    if (isDragging.value) {
      isDragging.value = false
      if (dragEndTimeout) {
        clearTimeout(dragEndTimeout)
        dragEndTimeout = null
      }
      event?.preventDefault?.()
      event?.stopPropagation?.()
      return
    }

    const currentTask = getTask()
    const customOpenEdit = getCustomOpenEdit()

    if (customOpenEdit) {
      customOpenEdit(currentTask)
    } else if (kanbanContext?.openEditTaskDialog) {
      kanbanContext.openEditTaskDialog(currentTask)
    }
  }

  return {
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handleDragStart,
    handleDragEnd,
    handleClick,
  }
}
