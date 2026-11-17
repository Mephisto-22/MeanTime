<template>
  <div class="flex flex-col gap-3">
    <ul class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
      <li
        v-for="person in rows"
        :key="person.userId ?? 'unknown'"
        data-testid="collaborator-time-row"
        class="flex items-center gap-3 py-2 text-sm"
      >
        <Avatar
          :label="person.userId === null ? undefined : initial(person.displayName)"
          :icon="person.userId === null ? 'pi pi-user' : undefined"
          shape="circle"
          :class="person.userId === null ? 'user-avatar-secondary' : 'user-avatar-primary'"
          class="shrink-0 text-xs font-semibold"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="truncate font-medium text-surface-800 dark:text-surface-100">
            {{ person.displayName }}<span v-if="person.userId === currentUserId" class="text-surface-400"> (you)</span>
          </span>
          <ProgressBar
            :value="person.share"
            :show-value="false"
            :aria-label="`${person.displayName}: ${person.share}% of the board's time`"
            class="!h-1.5"
          />
        </div>
        <span class="w-10 shrink-0 text-right tabular-nums text-surface-400">{{ person.share }}%</span>
        <span class="w-20 shrink-0 text-right tabular-nums text-surface-600 dark:text-surface-300">
          {{ formatDurationBadge(person.totalSeconds) }}
        </span>
      </li>
    </ul>
    <p
      v-if="!isShared"
      data-testid="collaborator-time-unshared"
      class="text-sm text-surface-500 dark:text-surface-400"
    >
      This board isn't shared. Share it to see how the work splits between collaborators.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { CollaboratorTimeDto } from '~/api/analytics'
import { formatDurationBadge } from '~/composables/useTaskTimer'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{
  collaborators: CollaboratorTimeDto[]
  totalSeconds: number
  isShared: boolean
}>()

const currentUserId = computed(() => useAuthStore().user?.id ?? null)

/** Each person with their share of the board's tracked time, as a whole percentage. */
const rows = computed(() =>
  props.collaborators.map(person => ({
    ...person,
    share: props.totalSeconds > 0 ? Math.round((person.totalSeconds / props.totalSeconds) * 100) : 0,
  })),
)

const initial = (name: string): string => (name.charAt(0) || 'U').toUpperCase()
</script>
