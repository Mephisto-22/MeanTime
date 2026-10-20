<template>
  <Card
    data-testid="kanban-task"
    :data-task-id="task.id"
    :pt="{ body: 'p-2.5', content: 'p-0' }"
    class="cursor-grab active:cursor-grabbing select-none transition-shadow duration-150"
    @click="handleClick"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @mousedown="handlePointerDown"
    @mousemove="handlePointerMove"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <template #content>
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">{{ task.title }}</span>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue'
import type { KanbanTaskDto } from '~/api/kanban'
import { kanbanContextKey } from '~/api/kanban'

const props = defineProps<{
  task: KanbanTaskDto
}>()

const kanbanContext = inject(kanbanContextKey, null)

const DRAG_THRESHOLD_PX = 5
const isDragging = ref(false)
let startX = 0
let startY = 0
let dragEndTimeout: ReturnType<typeof setTimeout> | null = null

const handlePointerDown = (event: PointerEvent | MouseEvent) => {
  startX = event?.clientX ?? 0
  startY = event?.clientY ?? 0
  isDragging.value = false
}

const handlePointerMove = (event: PointerEvent | MouseEvent) => {
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
  if (kanbanContext?.openEditTaskDialog) {
    kanbanContext.openEditTaskDialog(props.task)
  }
}

defineExpose({
  isDragging,
  handleClick,
  handlePointerDown,
  handlePointerMove,
  handleDragStart,
  handleDragEnd,
})
</script>
