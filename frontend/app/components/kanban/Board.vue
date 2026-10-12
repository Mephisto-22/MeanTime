<template>
  <div data-testid="kanban-board" class="flex w-full flex-col gap-6">
    <!-- Board Header -->
    <div v-if="board.name || board.description" class="flex flex-col gap-1">
      <h2 data-testid="board-title" class="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-50">
        {{ board.name }}
      </h2>
      <p
        v-if="board.description"
        data-testid="board-description"
        class="text-sm text-surface-600 dark:text-surface-400"
      >
        {{ board.description }}
      </p>
    </div>

    <!-- Horizontal Lane Track -->
    <div
      data-testid="kanban-lane-track"
      class="flex items-start gap-4 overflow-x-auto pb-4"
    >
      <template v-for="column in sortedColumns" :key="column.id">
        <slot name="column" :column="column">
          <KanbanColumn :column="column">
            <template v-if="$slots.task" #task="taskSlotProps">
              <slot name="task" v-bind="taskSlotProps" />
            </template>
          </KanbanColumn>
        </slot>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { KanbanBoardDto, KanbanColumnDto, KanbanTaskDto } from '~/types/kanban'

const props = defineProps<{
  board: KanbanBoardDto
}>()

defineSlots<{
  column?: (props: { column: KanbanColumnDto }) => any
  task?: (props: { task: KanbanTaskDto }) => any
}>()

const sortedColumns = computed(() => {
  return [...props.board.columns].sort((a, b) => a.order - b.order)
})
</script>
