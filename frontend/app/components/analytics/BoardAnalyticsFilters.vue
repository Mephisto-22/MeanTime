<template>
  <div data-testid="analytics-filters" class="flex flex-wrap items-center gap-3">
    <SelectButton
      v-model="timerMode"
      :options="TIMER_MODE_OPTIONS"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
      aria-label="Timer type"
      data-testid="analytics-timer-mode"
    />
    <MultiSelect
      v-if="availableTags.length > 0"
      v-model="tags"
      :options="availableTags"
      placeholder="All tags"
      display="chip"
      :show-toggle-all="false"
      :max-selected-labels="3"
      size="small"
      class="w-full sm:w-64"
      aria-label="Filter by tag"
      data-testid="analytics-tag-filter"
    />
  </div>
</template>

<script setup lang="ts">
import type { TimerModeFilter } from '~/api/analytics'

/**
 * The Stats page's filters: All / Countdown / Stopwatch tasks, and tasks with
 * any of the chosen tags. Every card on the page follows them.
 */
defineProps<{
  /** Tag names used on the board. */
  availableTags: string[]
}>()

const timerMode = defineModel<TimerModeFilter>('timerMode', { required: true })
const tags = defineModel<string[]>('tags', { required: true })

const TIMER_MODE_OPTIONS: Array<{ label: string; value: TimerModeFilter }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Countdown', value: 'COUNT_DOWN' },
  { label: 'Stopwatch', value: 'COUNT_UP' },
]
</script>
