<template>
  <div class="grid gap-4 md:grid-cols-3">
    <!-- Headline: the board's total tracked time -->
    <Card data-testid="analytics-total-tile" class="md:col-span-1">
      <template #subtitle>Total time tracked</template>
      <template #content>
        <p data-testid="analytics-total-value" class="text-4xl font-bold text-surface-900 dark:text-surface-0">
          {{ formatDurationBadge(analytics.totalSeconds) }}
        </p>
      </template>
    </Card>

    <!-- Time per column, in board order -->
    <Card data-testid="analytics-columns" class="md:col-span-2">
      <template #title>Time per column</template>
      <template #content>
        <ul class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
          <li
            v-for="column in analytics.columns"
            :key="column.columnId"
            data-testid="analytics-column-row"
            class="flex items-baseline justify-between gap-3 py-2 text-sm"
          >
            <span class="truncate font-medium text-surface-800 dark:text-surface-100">{{ column.title }}</span>
            <span class="shrink-0 tabular-nums text-surface-600 dark:text-surface-300">
              {{ formatDurationBadge(column.totalSeconds) }}
            </span>
          </li>
        </ul>
      </template>
    </Card>

    <!-- How long a task and a session take on average -->
    <TaskAverages :averages="analytics.averages" />

    <!-- Each column's share of the board total -->
    <Card data-testid="analytics-share" class="md:col-span-1">
      <template #title>Share of time</template>
      <template #content>
        <ColumnTimeShareChart :columns="analytics.columns" :total-seconds="analytics.totalSeconds" />
      </template>
    </Card>

    <!-- The tasks that took the most time -->
    <Card data-testid="analytics-top-tasks" class="md:col-span-2">
      <template #title>Top tasks by time</template>
      <template #content>
        <ol class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
          <li
            v-for="(task, index) in visibleTopTasks"
            :key="task.taskId"
            data-testid="analytics-top-task"
            class="flex items-center gap-3 py-2 text-sm"
          >
            <span class="w-5 shrink-0 text-right tabular-nums text-surface-400">{{ index + 1 }}</span>
            <span class="min-w-0 flex-1 truncate font-medium text-surface-800 dark:text-surface-100">{{ task.title }}</span>
            <Tag :value="task.columnTitle" severity="secondary" class="shrink-0 !text-xs" />
            <span class="w-20 shrink-0 text-right tabular-nums text-surface-600 dark:text-surface-300">
              {{ formatDurationBadge(task.totalSeconds) }}
            </span>
          </li>
        </ol>
      </template>
      <template v-if="analytics.topTasks.length > DEFAULT_ROW_LIMIT" #footer>
        <RowLimitFooter v-model="topTaskLimit" :total="analytics.topTasks.length" noun="tasks" />
      </template>
    </Card>

    <!-- How the board's time splits between the people who tracked it -->
    <Card data-testid="analytics-collaborators" class="md:col-span-3">
      <template #title>Time per collaborator</template>
      <template #content>
        <CollaboratorTimeList
          :collaborators="analytics.collaborators"
          :total-seconds="analytics.totalSeconds"
          :is-shared="analytics.isShared"
        />
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type { BoardAnalyticsDto } from '~/api/analytics'
import CollaboratorTimeList from '~/components/analytics/CollaboratorTimeList.vue'
import ColumnTimeShareChart from '~/components/analytics/ColumnTimeShareChart.vue'
import RowLimitFooter, { DEFAULT_ROW_LIMIT } from '~/components/analytics/RowLimitFooter.vue'
import TaskAverages from '~/components/analytics/TaskAverages.vue'
import { formatDurationBadge } from '~/composables/useTaskTimer'

const props = defineProps<{
  analytics: BoardAnalyticsDto
}>()

const topTaskLimit = ref(DEFAULT_ROW_LIMIT)
const visibleTopTasks = computed(() => props.analytics.topTasks.slice(0, topTaskLimit.value))
</script>
