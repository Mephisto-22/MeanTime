<template>
  <p
    v-if="!day.entries.length"
    data-testid="day-entries-empty"
    class="text-sm text-surface-500 dark:text-surface-400"
  >
    No time tracked on {{ formatDay(day.day) }}.
  </p>

  <ul v-else data-testid="day-entries" class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
    <li
      v-for="entry in day.entries"
      :key="entry.id"
      data-testid="day-entry"
      class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
    >
      <span data-testid="day-entry-time" class="w-36 shrink-0 tabular-nums text-surface-500 dark:text-surface-400">
        {{ formatTimeRange(entry) }}
      </span>
      <span class="min-w-0 flex-1 truncate font-medium text-surface-800 dark:text-surface-100">
        {{ entry.taskTitle }}
      </span>
      <Button
        as="router-link"
        :to="`/boards/${entry.boardId}`"
        :label="entry.boardTitle"
        severity="secondary"
        size="small"
        text
        class="shrink-0 !px-1 !py-0"
        data-testid="day-entry-board"
      />
      <span data-testid="day-entry-duration" class="w-20 shrink-0 text-right tabular-nums text-surface-600 dark:text-surface-300">
        {{ formatDurationBadge(entry.durationSeconds) }}
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type {DayEntryDto, DayTimeDto} from '~/api/analytics'
import {formatDurationBadge} from '~/composables/useTaskTimer'
import {formatDay} from '~/utils/days'

const props = defineProps<{
  day: DayTimeDto
  // The profile timezone the backend grouped the days by.
  timezone: string
}>()

const timeFormat = computed(
  () => new Intl.DateTimeFormat('en-US', {hour: 'numeric', minute: '2-digit', timeZone: props.timezone}),
)

function formatTimeRange(entry: DayEntryDto): string {
  const start = timeFormat.value.format(new Date(entry.startedAt))
  if (!entry.endedAt) return start
  return `${start} – ${timeFormat.value.format(new Date(entry.endedAt))}`
}
</script>
