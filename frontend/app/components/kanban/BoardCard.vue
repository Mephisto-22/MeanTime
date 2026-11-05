<template>
  <Card
    data-testid="board-card"
    class="group board-card"
    :pt="{ body: 'flex flex-col justify-between h-full p-5 gap-4 pt-6', content: 'flex-1 flex flex-col justify-between p-0 gap-4' }"
  >
    <template #header>
      <!-- Top Primary Accent Strip -->
      <div class="h-1 w-full bg-primary" />
    </template>
    <template #title>
      <div class="flex items-start justify-between gap-3">
        <NuxtLink
          :to="`/boards/${board.id}`"
          class="board-card-title-link"
        >
          {{ board.title }}
        </NuxtLink>
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

        <!-- Live Timer Running Pill (if any task on this board has a running timer) -->
        <div v-if="activeTimerCount > 0">
          <span class="board-timer-pill">
            <span class="h-2 w-2 rounded-full bg-emerald-500" />
            {{ activeTimerCount }} timer{{ activeTimerCount > 1 ? 's' : '' }} running
          </span>
        </div>

        <!-- Footer Meta Row: Section Task Counts & Collaborators / Open -->
        <div class="flex items-center justify-between border-t border-surface-100 dark:border-surface-800/80 pt-3 text-xs text-surface-500 dark:text-surface-400 gap-2">
          <!-- Section task counts (replaces the old 2 indicators) -->
          <div v-if="board.columns && board.columns.length > 0" class="flex items-center gap-1.5 overflow-hidden flex-wrap min-w-0">
            <span
              v-for="col in board.columns.slice(0, 3)"
              :key="col.id"
              class="board-col-chip"
            >
              <span class="h-1.5 w-1.5 rounded-full shrink-0" :class="col.tasks?.length ? 'bg-primary' : 'bg-surface-400'" />
              <span class="truncate">{{ col.title }}</span>
              <span class="text-[10px] text-surface-400 font-mono">({{ col.tasks?.length || 0 }})</span>
            </span>
            <span
              v-if="board.columns.length > 3"
              class="text-[11px] font-medium text-surface-400 shrink-0"
            >
              +{{ board.columns.length - 3 }} more
            </span>
          </div>
          <span v-else class="text-xs text-surface-400 italic">No columns</span>

          <!-- Collaborators preview if available -->
          <div
            v-if="board.collaborators && board.collaborators.length > 0"
            class="flex -space-x-1.5 overflow-hidden shrink-0"
          >
            <Avatar
              v-for="c in board.collaborators.slice(0, 3)"
              :key="c.id"
              :label="(c.display_name?.charAt(0) || 'U').toUpperCase()"
              shape="circle"
              size="small"
              class="border-2 border-surface-0 user-avatar-primary text-[10px] font-bold dark:border-surface-900"
            />
            <span
              v-if="board.collaborators.length > 3"
              class="avatar-overflow-badge"
            >
              +{{ board.collaborators.length - 3 }}
            </span>
          </div>
          <span v-else class="text-[11px] text-surface-400 flex items-center gap-1 group-hover:text-primary transition-colors font-medium shrink-0">
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
