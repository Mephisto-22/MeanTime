<template>
  <ul class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
    <li
      v-for="person in rows"
      :key="person.userId ?? 'unknown'"
      data-testid="collaborator-time-row"
      class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 py-2 text-sm"
    >
      <Avatar
        :label="person.userId === null ? undefined : initial(person.displayName)"
        :icon="person.userId === null ? 'pi pi-user' : undefined"
        shape="circle"
        :class="person.userId === null ? 'user-avatar-secondary' : 'user-avatar-primary'"
        class="row-span-2 text-xs"
      />
      <span class="truncate font-medium">
        {{ person.displayName }}<span v-if="person.userId === currentUserId" class="text-muted-color"> (you)</span>
      </span>
      <span class="w-20 text-right">{{ formatDurationBadge(person.totalSeconds) }}</span>
      <span class="w-10 text-right text-muted-color">{{ person.share }}%</span>
      <ProgressBar
        :value="person.share"
        :show-value="false"
        :aria-label="`${person.displayName}: ${person.share}% of the board's time`"
        class="col-span-3 col-start-2 !h-1.5"
      />
    </li>
  </ul>
  <Message
    v-if="!isShared"
    data-testid="collaborator-time-unshared"
    severity="secondary"
    variant="simple"
    class="mt-3"
  >
    This board isn't shared. Share it to see how the work splits between collaborators.
  </Message>
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
