<template>
  <Card
    data-testid="board-card"
    class="group relative flex flex-col justify-between h-full rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-0 dark:bg-surface-900 shadow-sm transition-colors hover:border-primary-400 dark:hover:border-primary-600 focus-within:ring-2 focus-within:ring-primary"
    :pt="{ body: 'flex flex-col justify-between h-full p-5 gap-4', content: 'flex-1 p-0' }"
  >
    <template #title>
      <div class="flex items-start justify-between gap-3">
        <NuxtLink
          :to="`/boards/${board.id}`"
          class="min-w-0 truncate text-lg font-bold tracking-tight text-surface-900 dark:text-surface-0 hover:text-primary outline-none after:absolute after:inset-0 after:content-['']"
        >
          {{ board.title }}
        </NuxtLink>
        <Button
          icon="pi pi-pencil"
          severity="secondary"
          text
          rounded
          size="small"
          class="relative z-10 shrink-0 opacity-70 group-hover:opacity-100"
          :aria-label="`Edit ${board.title}`"
          @click="emit('edit', board)"
        />
      </div>
    </template>
    <template #content>
      <div class="flex flex-col gap-4 justify-between h-full">
        <p class="text-sm leading-relaxed text-surface-600 dark:text-surface-400 line-clamp-2">
          {{ board.description || 'No description provided' }}
        </p>

        <!-- Board Metrics Row -->
        <div class="flex items-center justify-between border-t border-surface-100 dark:border-surface-800/80 pt-3 text-xs text-surface-500 dark:text-surface-400">
          <div class="flex items-center gap-3">
            <span class="inline-flex items-center gap-1 font-medium">
              <i class="pi pi-table text-[11px] text-surface-400" />
              {{ board.columns?.length || 0 }} {{ (board.columns?.length === 1) ? 'column' : 'columns' }}
            </span>
            <span class="inline-flex items-center gap-1 font-medium">
              <i class="pi pi-check-square text-[11px] text-surface-400" />
              {{ totalTaskCount }} {{ (totalTaskCount === 1) ? 'task' : 'tasks' }}
            </span>
          </div>

          <!-- Collaborators preview if available -->
          <div
            v-if="board.collaborators && board.collaborators.length > 0"
            class="flex -space-x-1.5 overflow-hidden"
          >
            <Avatar
              v-for="c in board.collaborators.slice(0, 2)"
              :key="c.id"
              :label="(c.display_name?.charAt(0) || 'U').toUpperCase()"
              shape="circle"
              size="small"
              class="border-2 border-surface-0 bg-primary-100 text-[10px] font-bold text-primary-700 dark:border-surface-900 dark:bg-primary-950 dark:text-primary-300"
            />
            <span
              v-if="board.collaborators.length > 2"
              class="flex h-5 w-5 items-center justify-center rounded-full bg-surface-200 text-[9px] font-bold text-surface-600 dark:bg-surface-700 dark:text-surface-300"
            >
              +{{ board.collaborators.length - 2 }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { KanbanBoardDto } from '~/api/kanban';

interface Props {
  board: KanbanBoardDto;
}

interface Emits {
  /** Fired when the user asks to edit this board. */
  edit: [board: KanbanBoardDto];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const totalTaskCount = computed(() => {
  return (props.board.columns || []).reduce(
    (acc, col) => acc + (col.tasks?.length || 0),
    0,
  );
});
</script>
