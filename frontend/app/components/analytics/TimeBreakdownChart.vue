<template>
  <Chart
    type="bar"
    :data="chartData"
    :options="chartOptions"
    :canvas-props="{role: 'img', 'aria-label': ariaLabel}"
    class="relative"
    :style="{height: `${chartHeight}px`}"
    data-testid="time-breakdown-chart"
  />
</template>

<script setup lang="ts">
import type {ChartData, ChartOptions} from 'chart.js'
import type {BreakdownRowDto} from '~/api/analytics'
import {TASK_PRIORITY_CONFIG} from '~/api/kanban'
import {formatDurationBadge} from '~/composables/useTaskTimer'

/**
 * A horizontal bar per tag or priority, longest first as the rows come.
 * Bars rather than a donut, because tag totals can add up to more than the
 * whole when a task has several tags.
 */
const props = defineProps<{
  rows: BreakdownRowDto[]
  /** What the rows are, for their labels: tag names or priority values. */
  kind: 'tag' | 'priority'
}>()

// Validated against the dark card surface (#18181b) with the dataviz palette checks,
// the same blue as the time per day chart. "None" is a neutral grey.
const BAR_COLOR = '#3987e5'
const BAR_HOVER_COLOR = '#5c9cec'
const NONE_COLOR = '#71717a'
const AXIS_TEXT_COLOR = '#a1a1aa'
const GRID_COLOR = '#27272a'
const BAR_THICKNESS = 18
const ROW_HEIGHT = 32
const AXIS_HEIGHT = 32

const SECONDS_PER_HOUR = 3600
const SECONDS_PER_MINUTE = 60

const labels = computed(() => props.rows.map(row => {
  if (row.name === null) return 'None'
  if (props.kind === 'priority' && row.name in TASK_PRIORITY_CONFIG) {
    return TASK_PRIORITY_CONFIG[row.name as keyof typeof TASK_PRIORITY_CONFIG].label
  }
  return row.name
}))

// The axis counts hours once any bar reaches an hour, and minutes before that.
const unit = computed(() => {
  const maxSeconds = Math.max(0, ...props.rows.map(row => row.totalSeconds))
  return maxSeconds >= SECONDS_PER_HOUR
    ? {seconds: SECONDS_PER_HOUR, suffix: 'h'}
    : {seconds: SECONDS_PER_MINUTE, suffix: 'm'}
})

const chartHeight = computed(() => props.rows.length * ROW_HEIGHT + AXIS_HEIGHT)

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: labels.value,
  datasets: [
    {
      data: props.rows.map(row => row.totalSeconds / unit.value.seconds),
      backgroundColor: props.rows.map(row => (row.name === null ? NONE_COLOR : BAR_COLOR)),
      hoverBackgroundColor: props.rows.map(row => (row.name === null ? NONE_COLOR : BAR_HOVER_COLOR)),
      barThickness: BAR_THICKNESS,
      borderRadius: 4,
      // Round the end of each bar and keep it square on the baseline.
      borderSkipped: 'start',
    },
  ],
}))

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  // The whole row responds, not just its bar.
  interaction: {mode: 'index', intersect: false},
  plugins: {
    legend: {display: false},
    tooltip: {
      displayColors: false,
      callbacks: {
        title: items => labels.value[items[0]!.dataIndex] ?? '',
        label: item => formatDurationBadge(props.rows[item.dataIndex]?.totalSeconds),
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: {color: GRID_COLOR},
      border: {display: false},
      ticks: {
        color: AXIS_TEXT_COLOR,
        maxTicksLimit: 5,
        callback: value => `${value}${unit.value.suffix}`,
      },
    },
    y: {
      grid: {display: false},
      border: {color: GRID_COLOR},
      ticks: {color: AXIS_TEXT_COLOR},
    },
  },
}))

const ariaLabel = computed(() => {
  const values = props.rows.map((row, index) => `${labels.value[index]} ${formatDurationBadge(row.totalSeconds)}`)
  return `Bar chart of tracked time per ${props.kind}: ${values.join(', ')}`
})
</script>
