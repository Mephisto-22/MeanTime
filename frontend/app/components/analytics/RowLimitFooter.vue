<template>
  <div class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-3 dark:border-surface-700">
    <span data-testid="row-limit-count" class="text-sm text-surface-500 dark:text-surface-400">
      Showing {{ Math.min(total, limit) }} of {{ total }} {{ noun }}
    </span>
    <SelectButton
      v-model="limit"
      :options="ROW_LIMITS"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
      :aria-label="`${noun} shown`"
      data-testid="row-limit-select"
    />
  </div>
</template>

<script lang="ts">
/** How many rows a Stats list shows before the reader asks for more. */
export const DEFAULT_ROW_LIMIT = 5

const ROW_LIMITS = [
  {label: '5', value: DEFAULT_ROW_LIMIT},
  {label: '10', value: 10},
  {label: '25', value: 25},
  {label: 'All', value: Number.POSITIVE_INFINITY},
]
</script>

<script setup lang="ts">
/**
 * "Showing 5 of 12 tasks" with 5 / 10 / 25 / All buttons, for the bottom of a
 * list that would otherwise be too long to read at a glance.
 */
defineProps<{
  total: number
  /** What the rows are, in the plural: "tasks". */
  noun: string
}>()

const limit = defineModel<number>({required: true})
</script>
