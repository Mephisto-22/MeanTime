import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTaskInteraction } from '~/composables/useTaskInteraction'
import { createTaskFixture } from '../fixtures/kanban'

describe('useTaskInteraction Composable', () => {
  it('initializes with isDragging false', () => {
    const task = createTaskFixture({ id: 'task-1' })
    const { isDragging } = useTaskInteraction(task)
    expect(isDragging.value).toBe(false)
  })

  it('handlePointerDown resets isDragging to false', () => {
    const task = createTaskFixture({ id: 'task-1' })
    const { isDragging, handlePointerDown, handleDragStart } = useTaskInteraction(task)

    handleDragStart()
    expect(isDragging.value).toBe(true)

    handlePointerDown({ clientX: 10, clientY: 10 } as PointerEvent)
    expect(isDragging.value).toBe(false)
  })

  it('handlePointerMove sets isDragging true only when exceeding 5px threshold', () => {
    const task = createTaskFixture({ id: 'task-1' })
    const { isDragging, handlePointerDown, handlePointerMove } = useTaskInteraction(task)

    handlePointerDown({ clientX: 10, clientY: 10 } as PointerEvent)

    // Move by 3px horizontally, 4px vertically -> hypot(3, 4) = 5 -> not > 5
    handlePointerMove({ clientX: 13, clientY: 14, buttons: 1 } as PointerEvent)
    expect(isDragging.value).toBe(false)

    // Move slightly more: deltaX = 4, deltaY = 4 -> hypot(4, 4) = ~5.66 > 5
    handlePointerMove({ clientX: 14, clientY: 14, buttons: 1 } as PointerEvent)
    expect(isDragging.value).toBe(true)
  })

  it('handlePointerMove ignores movement when buttons is 0', () => {
    const task = createTaskFixture({ id: 'task-1' })
    const { isDragging, handlePointerDown, handlePointerMove } = useTaskInteraction(task)

    handlePointerDown({ clientX: 10, clientY: 10 } as PointerEvent)
    handlePointerMove({ clientX: 100, clientY: 100, buttons: 0 } as PointerEvent)
    expect(isDragging.value).toBe(false)
  })

  it('handleDragStart sets isDragging to true', () => {
    const task = createTaskFixture({ id: 'task-1' })
    const { isDragging, handleDragStart } = useTaskInteraction(task)

    handleDragStart()
    expect(isDragging.value).toBe(true)
  })

  it('handleDragEnd clears isDragging after timeout', async () => {
    vi.useFakeTimers()
    const task = createTaskFixture({ id: 'task-1' })
    const { isDragging, handleDragStart, handleDragEnd } = useTaskInteraction(task)

    handleDragStart()
    expect(isDragging.value).toBe(true)

    handleDragEnd()
    expect(isDragging.value).toBe(true)

    vi.advanceTimersByTime(110)
    expect(isDragging.value).toBe(false)
    vi.useRealTimers()
  })

  it('handleClick invokes custom callback or onOpenEdit option when not dragging', () => {
    const task = createTaskFixture({ id: 'task-1' })
    const onOpenEdit = vi.fn()
    const { handleClick } = useTaskInteraction(task, onOpenEdit)

    handleClick()
    expect(onOpenEdit).toHaveBeenCalledWith(task)
  })

  it('handleClick suppresses callback and resets isDragging when dragging', () => {
    const task = createTaskFixture({ id: 'task-1' })
    const onOpenEdit = vi.fn()
    const { isDragging, handleDragStart, handleClick } = useTaskInteraction(task, onOpenEdit)

    handleDragStart()
    expect(isDragging.value).toBe(true)

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    handleClick(event)
    expect(onOpenEdit).not.toHaveBeenCalled()
    expect(isDragging.value).toBe(false)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('supports reactive task getter and Ref', () => {
    const taskRef = ref(createTaskFixture({ id: 'task-ref', title: 'Ref Task' }))
    const onOpenEdit = vi.fn()
    const { handleClick } = useTaskInteraction(() => taskRef.value, onOpenEdit)

    handleClick()
    expect(onOpenEdit).toHaveBeenCalledWith(taskRef.value)
  })
})
