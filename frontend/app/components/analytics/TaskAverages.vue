<template>
  <Card data-testid="analytics-averages" class="md:col-span-3">
    <template #title>Averages</template>
    <template #subtitle>
      Across {{ averages.taskCount }} {{ averages.taskCount === 1 ? 'task' : 'tasks' }} with tracked time
      and {{ averages.sessionCount }} {{ averages.sessionCount === 1 ? 'session' : 'sessions' }}
    </template>
    <template #content>
      <dl class="grid gap-4 sm:grid-cols-3">
        <div v-for="stat in stats" :key="stat.label" data-testid="analytics-average">
          <dt class="text-sm text-surface-500 dark:text-surface-400">{{ stat.label }}</dt>
          <dd class="text-3xl font-bold tabular-nums text-surface-900 dark:text-surface-0">{{ stat.value }}</dd>
        </div>
      </dl>
    </template>
  </Card>
</template>

<script setup lang="ts">
import type { TaskAveragesDto } from '~/api/analytics'
import { formatDurationBadge } from '~/composables/useTaskTimer'

/** Time per task, session length and sessions per task, for the tasks on show. */
const props = defineProps<{
  averages: TaskAveragesDto
}>()

const stats = computed(() => {
  const { averageTaskSeconds, averageSessionSeconds, averageSessionsPerTask } = props.averages
  return [
    { label: 'Time per task', value: averageTaskSeconds === null ? '—' : formatDurationBadge(averageTaskSeconds) },
    { label: 'Session length', value: averageSessionSeconds === null ? '—' : formatDurationBadge(averageSessionSeconds) },
    { label: 'Sessions per task', value: averageSessionsPerTask === null ? '—' : String(averageSessionsPerTask) },
  ]
})
</script>
