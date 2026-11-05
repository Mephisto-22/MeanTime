<template>
  <Card
    data-testid="board-card"
    class="group relative flex flex-col justify-between h-full rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-0 dark:bg-surface-900 transition-all duration-200 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-lg hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-primary overflow-hidden"
    :pt="{ body: 'flex flex-col justify-between h-full p-5 gap-4', content: 'flex-1 flex flex-col justify-between p-0 gap-4' }"
  >
    <template #title>
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400 border border-primary-200/50 dark:border-primary-800/50">
            <i class="pi pi-table text-sm" />
          </div>
          <NuxtLink
            :to="`/boards/${board.id}`"
            class="min-w-0 truncate text-lg font-bold tracking-tight text-surface-900 dark:text-surface-0 group-hover:text-primary outline-none transition-colors after:absolute after:inset-0 after:content-['']"
          >
            {{ board.title }}
          </NuxtLink>
        </div>
        <Button
          icon="pi pi-pencil"
          severity="secondary"
          text
          rounded
          size="small"
          class="relative z-10 shrink-0 text-surface-400 opacity-60 group-hover:opacity-100 transition-opacity"
          :aria-label="`Edit ${board.title}`"
          @click="emit('edit', board)"
        />
      </div>
    </template>
    <template #content>
      <div class="flex flex-col gap-4 justify-between flex-1">
        <p class="text-sm leading-relaxed text-surface-600 dark:text-surface-400 line-clamp-2 min-h-[2.5rem]">
          {{ board.description || 'No description provided' }}
        </p>

        <!-- Pipeline Workflow Stage Visualizer -->
        <div v-if="board.columns && board.columns.length > 0" class="flex flex-col gap-2">
          <!-- Visual progress stage bar -->
          <div class="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800 gap-0.5">
            <div
              v-for="(col, idx) in board.columns"
              :key="col.id"
              class="h-full transition-all duration-300"
              :class="[
                idx === 0 ? 'bg-surface-400 dark:bg-surface-500' :
                idx === board.columns.length - 1 ? 'bg-emerald-500' :
                'bg-primary-500'
              ]"
              :style="{ width: `${100 / board.columns.length}%` }"
            />
          </div>

          <!-- Pipeline column preview pills -->
          <div class="flex items-center gap-1.5 overflow-hidden flex-wrap">
            <span
              v-for="col in board.columns.slice(0, 3)"
              :key="col.id"
              class="inline-flex items-center gap-1.5 rounded-md bg-surface-100 dark:bg-surface-800/80 px-2 py-0.5 text-[11px] font-medium text-surface-700 dark:text-surface-300 truncate max-w-[130px]"
            >
              <span class="h-1.5 w-1.5 rounded-full shrink-0" :class="col.tasks?.length ? 'bg-primary-500' : 'bg-surface-400'" />
              <span class="truncate">{{ col.title }}</span>
              <span class="text-[10px] text-surface-400 font-mono">({{ col.tasks?.length || 0 }})</span>
            </span>
            <span
              v-if="board.columns.length > 3"
              class="text-[11px] font-medium text-surface-400"
            >
              +{{ board.columns.length - 3 }} more
            </span>
          </div>
        </div>

        <!-- Live Timer Running Pill (if any task on this board has a running timer) -->
        <div v-if="activeTimerCount > 0">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 animate-pulse">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {{ activeTimerCount }} timer{{ activeTimerCount > 1 ? 's' : '' }} running
          </span>
        </div>

        <!-- Footer Meta Row -->
        <div class="flex items-center justify-between border-t border-surface-100 dark:border-surface-800/80 pt-3 text-xs text-surface-500 dark:text-surface-400">
          <div class="flex items-center gap-3">
            <span class="inline-flex items-center gap-1 font-medium">
              <i class="pi pi-check-square text-[11px] text-surface-400" />
              {{ totalTaskCount }} {{ (totalTaskCount === 1) ? 'task' : 'tasks' }}
            </span>
            <span class="inline-flex items-center gap-1 font-medium">
              <i class="pi pi-table text-[11px] text-surface-400" />
              {{ board.columns?.length || 0 }} {{ (board.columns?.length === 1) ? 'column' : 'columns' }}
            </span>
          </div>

          <!-- Collaborators preview if available -->
          <div
            v-if="board.collaborators && board.collaborators.length > 0"
            class="flex -space-x-1.5 overflow-hidden"
          >
            <Avatar
              v-for="c in board.collaborators.slice(0, 3)"
              :key="c.id"
              :label="(c.display_name?.charAt(0) || 'U').toUpperCase()"
              shape="circle"
              size="small"
              class="border-2 border-surface-0 bg-primary-100 text-[10px] font-bold text-primary-700 dark:border-surface-900 dark:bg-primary-950 dark:text-primary-300"
            />
            <span
              v-if="board.collaborators.length > 3"
              class="flex h-5 w-5 items-center justify-center rounded-full bg-surface-200 text-[9px] font-bold text-surface-600 dark:bg-surface-700 dark:text-surface-300"
            >
              +{{ board.collaborators.length - 3 }}
            </span>
          </div>
          <span v-else class="text-[11px] text-surface-400 flex items-center gap-1 group-hover:text-primary transition-colors font-medium">
            Open <i class="pi pi-arrow-right text-[9px]" />
          </span>
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

const activeTimerCount = computed(() => {
  return (props.board.columns || []).reduce((acc, col) => {
    return acc + (col.tasks || []).filter(t => t.timer && t.timer.state === 'RUNNING').length;
  }, 0);
});
</script>
