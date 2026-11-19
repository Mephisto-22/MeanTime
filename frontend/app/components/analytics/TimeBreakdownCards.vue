<template>
  <div class="grid gap-4 md:grid-cols-3">
    <Card data-testid="breakdown-tags" class="min-w-0 md:col-span-2">
      <template #title>Time per tag</template>
      <template #content>
        <TimeBreakdownChart :rows="breakdown.tags" kind="tag" />
      </template>
    </Card>

    <Card data-testid="breakdown-priorities" class="min-w-0">
      <template #title>Time per priority</template>
      <template #content>
        <TimeBreakdownChart :rows="breakdown.priorities" kind="priority" />
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type {TimeBreakdownDto} from '~/api/analytics'
import TimeBreakdownChart from '~/components/analytics/TimeBreakdownChart.vue'

/** Time per tag and time per priority, side by side; used on both analytics pages. */
defineProps<{
  breakdown: TimeBreakdownDto
}>()
</script>
