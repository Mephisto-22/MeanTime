<template>
  <Card
    data-testid="board-card"
    class="relative h-full shadow-md transition-shadow focus-within:ring-2 focus-within:ring-primary hover:shadow-lg"
  >
    <template #title>
      <div class="flex items-start justify-between gap-2">
        <!-- The after: classes stretch this link over the whole card, so clicking anywhere opens the board. -->
        <NuxtLink
          :to="`/boards/${board.id}`"
          class="min-w-0 break-words outline-none after:absolute after:inset-0 after:content-['']"
        >
          {{ board.title }}
        </NuxtLink>
        <!-- relative z-10 keeps the button above the stretched link so it stays clickable. -->
        <Button
          icon="pi pi-pencil"
          severity="secondary"
          text
          rounded
          size="small"
          class="relative z-10 shrink-0"
          :aria-label="`Edit ${board.title}`"
          @click="emit('edit', board)"
        />
      </div>
    </template>
    <template #content>
      <p class="text-sm leading-relaxed text-surface-600 dark:text-surface-300">
        {{ board.description || 'No description' }}
      </p>
    </template>
  </Card>
</template>

<script setup lang="ts">
import type {KanbanBoardDto} from '~/api/kanban';

interface Props {
  board: KanbanBoardDto;
}

interface Emits {
  /** Fired when the user asks to edit this board. */
  edit: [board: KanbanBoardDto];
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>
