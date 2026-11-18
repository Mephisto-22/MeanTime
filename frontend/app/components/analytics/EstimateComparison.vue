<template>
  <!-- min-w-0 lets the table scroll inside the card instead of widening the page on phones -->
  <Card data-testid="estimate-comparison" class="min-w-0 md:col-span-3">
    <template #title>
      Planned vs actual <span class="text-surface-500 dark:text-surface-400">(countdown)</span>
    </template>
    <template #content>
      <div class="flex flex-col gap-4">
        <!-- Estimate accuracy: how far off the targets were on average -->
        <div v-if="estimates.tasks.length > 0" data-testid="estimate-accuracy">
          <p class="text-sm text-surface-500 dark:text-surface-400">Estimate accuracy</p>
          <template v-if="estimates.averageDifferencePercent !== null">
            <p data-testid="estimate-accuracy-value" class="text-3xl font-bold text-surface-900 dark:text-surface-0">
              {{ accuracyLabel }}
            </p>
            <p class="text-sm text-surface-500 dark:text-surface-400">
              on average, across {{ estimates.trackedTaskCount }}
              {{ estimates.trackedTaskCount === 1 ? 'task' : 'tasks' }} with tracked time
            </p>
          </template>
          <p v-else data-testid="estimate-accuracy-empty" class="text-sm text-surface-600 dark:text-surface-300">
            No time tracked on these tasks yet.
          </p>
        </div>

        <DataTable
          v-if="estimates.tasks.length > 0"
          :sort-field="sortField"
          v-model:sort-order="sortOrder"
          :value="visibleTasks"
          data-key="taskId"
          :row-class="rowClass"
          size="small"
          data-testid="estimate-table"
          @update:sort-field="onSortFieldUpdate"
        >
          <Column field="title" header="Task" sortable>
            <template #body="{ data }">
              <div class="flex min-w-0 flex-col">
                <span class="truncate font-medium text-surface-800 dark:text-surface-100">{{ data.title }}</span>
                <span class="text-xs text-surface-500 dark:text-surface-400">{{ data.columnTitle }}</span>
              </div>
            </template>
          </Column>
          <Column field="plannedSeconds" header="Planned" sortable>
            <template #body="{ data }">
              <span class="whitespace-nowrap tabular-nums">{{ formatDurationBadge(data.plannedSeconds) }}</span>
            </template>
          </Column>
          <Column field="actualSeconds" header="Actual" sortable>
            <template #body="{ data }">
              <span class="whitespace-nowrap tabular-nums">{{ formatDurationBadge(data.actualSeconds) }}</span>
            </template>
          </Column>
          <Column field="differenceSeconds" header="Difference" sortable>
            <template #body="{ data }">
              <div class="flex items-center gap-2" data-testid="estimate-difference">
                <span class="whitespace-nowrap tabular-nums">{{ formatDifference(data.differenceSeconds) }}</span>
                <Tag
                  v-if="data.differenceSeconds > 0"
                  value="Over"
                  severity="danger"
                  icon="pi pi-exclamation-triangle"
                  class="!text-xs"
                  data-testid="estimate-over-tag"
                />
              </div>
            </template>
          </Column>
        </DataTable>
        <Message v-else data-testid="estimate-empty" severity="secondary" icon="pi pi-hourglass">
          No tasks on this board have a countdown target. Set one in a task's timer to compare planned and actual time.
        </Message>
      </div>
    </template>
    <template v-if="estimates.tasks.length > DEFAULT_ROW_LIMIT" #footer>
      <RowLimitFooter v-model="rowLimit" :total="estimates.tasks.length" noun="tasks" />
    </template>
  </Card>
</template>

<script setup lang="ts">
import type { EstimatesDto, TaskEstimateDto } from '~/api/analytics'
import RowLimitFooter, { DEFAULT_ROW_LIMIT } from '~/components/analytics/RowLimitFooter.vue'
import { formatDurationBadge } from '~/composables/useTaskTimer'

const props = defineProps<{
  estimates: EstimatesDto
}>()

const SORTABLE_FIELDS = ['title', 'plannedSeconds', 'actualSeconds', 'differenceSeconds'] as const
type SortableField = (typeof SORTABLE_FIELDS)[number]

// The table only gets the rows on show, so it sorts here, across every task,
// before cutting the list off at the limit.
const sortField = ref<SortableField | undefined>('differenceSeconds')
const sortOrder = ref<number | undefined>(-1)
const rowLimit = ref(DEFAULT_ROW_LIMIT)

function isSortableField(field: string): field is SortableField {
  return (SORTABLE_FIELDS as readonly string[]).includes(field)
}

function onSortFieldUpdate(field: string) {
  sortField.value = isSortableField(field) ? field : undefined
}

const visibleTasks = computed(() => {
  const field = sortField.value
  const direction = sortOrder.value ?? 1
  const tasks = [...props.estimates.tasks]
  if (field) {
    tasks.sort((a, b) => {
      const order = field === 'title' ? a.title.localeCompare(b.title) : a[field] - b[field]
      return order * direction
    })
  }
  return tasks.slice(0, rowLimit.value)
})

/** "20% over", "10% under" or "On target". */
const accuracyLabel = computed(() => {
  const percent = props.estimates.averageDifferencePercent ?? 0
  if (percent === 0) return 'On target'
  return `${Math.abs(percent)}% ${percent > 0 ? 'over' : 'under'}`
})

/** "+5m" over the target, "−5m" under it, or "On target". */
function formatDifference(seconds: number): string {
  if (seconds === 0) return 'On target'
  return `${seconds > 0 ? '+' : '−'}${formatDurationBadge(Math.abs(seconds))}`
}

/** Tasks over their target get a tinted row, alongside the "Over" tag. */
const rowClass = (task: TaskEstimateDto): string =>
  task.differenceSeconds > 0 ? 'estimate-over-row !bg-red-500/10' : ''
</script>
