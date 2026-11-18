<template>
  <Chart
    type="bar"
    :data="chartData"
    :options="chartOptions"
    :canvas-props="{role: 'img', 'aria-label': ariaLabel}"
    class="relative h-64"
    data-testid="daily-time-chart"
  />
</template>

<script setup lang="ts">
import type {ChartData, ChartOptions} from 'chart.js'
import type {DayTimeDto} from '~/api/analytics'
import {formatDurationBadge} from '~/composables/useTaskTimer'
import {formatDay} from '~/utils/days'

const props = defineProps<{
  days: DayTimeDto[]
  selectedDay: string | null
}>()

const emit = defineEmits<{
  select: [day: string]
}>()

// Validated against the dark card surface (#18181b) with the dataviz palette checks.
const BAR_COLOR = '#3987e5'
const BAR_HOVER_COLOR = '#5c9cec'
// The same hue, faded, for the days that aren't selected.
const BAR_FADED_COLOR = 'rgba(57, 135, 229, 0.35)'
const AXIS_TEXT_COLOR = '#a1a1aa'
const GRID_COLOR = '#27272a'
const MAX_BAR_THICKNESS = 24
// Short ranges show the weekday; longer ones show the month.
const WEEKDAY_LABEL_MAX_DAYS = 14

const SECONDS_PER_HOUR = 3600
const SECONDS_PER_MINUTE = 60

// The axis counts hours once any day reaches an hour, and minutes before that.
const unit = computed(() => {
  const maxSeconds = Math.max(0, ...props.days.map(day => day.totalSeconds))
  return maxSeconds >= SECONDS_PER_HOUR
    ? {seconds: SECONDS_PER_HOUR, suffix: 'h'}
    : {seconds: SECONDS_PER_MINUTE, suffix: 'm'}
})

// "Mon 9" for a short range, "Nov 9" for a long one. en-US would write a
// weekday with a day number as "9 Mon", so the short label is built in parts.
function axisLabel(day: string): string {
  if (props.days.length > WEEKDAY_LABEL_MAX_DAYS) {
    return formatDay(day, {month: 'short', day: 'numeric'})
  }
  return `${formatDay(day, {weekday: 'short'})} ${Number(day.slice(8))}`
}

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: props.days.map(day => axisLabel(day.day)),
  datasets: [
    {
      data: props.days.map(day => day.totalSeconds / unit.value.seconds),
      backgroundColor: props.days.map(day =>
        props.selectedDay === null || day.day === props.selectedDay ? BAR_COLOR : BAR_FADED_COLOR,
      ),
      hoverBackgroundColor: BAR_HOVER_COLOR,
      maxBarThickness: MAX_BAR_THICKNESS,
      borderRadius: 4,
      // Round the top of each bar and keep it square on the baseline.
      borderSkipped: 'start',
    },
  ],
}))

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // The whole column of a day responds, not just its bar.
  interaction: {mode: 'index', intersect: false},
  onClick: (_event, elements) => {
    const index = elements[0]?.index
    const day = index === undefined ? undefined : props.days[index]
    if (day) emit('select', day.day)
  },
  onHover: (event, elements) => {
    const target = event.native?.target as HTMLElement | undefined
    if (target) target.style.cursor = elements.length ? 'pointer' : 'default'
  },
  plugins: {
    legend: {display: false},
    tooltip: {
      displayColors: false,
      callbacks: {
        // The value leads and the day follows.
        title: items => formatDurationBadge(props.days[items[0]!.dataIndex]?.totalSeconds),
        label: item => formatDay(props.days[item.dataIndex]!.day),
      },
    },
  },
  scales: {
    x: {
      grid: {display: false},
      border: {color: GRID_COLOR},
      ticks: {color: AXIS_TEXT_COLOR, maxRotation: 0, autoSkip: true},
    },
    y: {
      beginAtZero: true,
      grid: {color: GRID_COLOR},
      border: {display: false},
      ticks: {
        color: AXIS_TEXT_COLOR,
        maxTicksLimit: 5,
        callback: value => `${value}${unit.value.suffix}`,
      },
    },
  },
}))

const ariaLabel = computed(() => {
  const first = props.days[0]
  const last = props.days[props.days.length - 1]
  if (!first || !last) return 'Bar chart of tracked time per day'
  return `Bar chart of tracked time per day from ${formatDay(first.day)} to ${formatDay(last.day)}. `
    + 'The entries below list each day\'s total.'
})
</script>
