<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6">
    <h1 data-testid="personal-analytics-title" class="text-xl font-bold tracking-tight text-surface-900 dark:text-surface-0">
      Your tracked time
    </h1>

    <!-- Date range: presets first, then a custom range -->
    <div role="group" aria-label="Date range" class="flex flex-wrap items-center gap-3">
      <SelectButton
        v-model="preset"
        :options="PRESETS"
        option-label="label"
        option-value="days"
        :allow-empty="false"
        data-testid="analytics-range-presets"
      />
      <DatePicker
        v-model="customRange"
        selection-mode="range"
        :max-date="fromDay(today)"
        :manual-input="false"
        date-format="M d, yy"
        placeholder="Custom range"
        show-icon
        data-testid="analytics-range-picker"
      />
    </div>
    <Message v-if="rangeError" severity="warn" data-testid="analytics-range-error">
      {{ rangeError }}
    </Message>

    <!-- Loading -->
    <div v-if="status === 'pending' && !daily" data-testid="personal-analytics-loading" class="flex flex-col gap-4">
      <Skeleton height="18rem" border-radius="12px" />
      <Skeleton height="8rem" border-radius="12px" />
    </div>

    <!-- Error -->
    <Message v-else-if="error" data-testid="personal-analytics-error" severity="error" role="alert">
      <div class="flex flex-wrap items-center gap-3">
        <span>We couldn't load your tracked time.</span>
        <Button
          label="Try again"
          icon="pi pi-refresh"
          severity="danger"
          text
          size="small"
          @click="() => refresh()"
        />
      </div>
    </Message>

    <!-- No tracked time in the range -->
    <Message
      v-else-if="daily && daily.totalSeconds === 0"
      data-testid="personal-analytics-empty"
      severity="secondary"
      icon="pi pi-clock"
    >
      You haven't tracked any time between {{ formatDay(daily.start) }} and {{ formatDay(daily.end) }}.
      Start a timer or log past work on a task to see it here.
    </Message>

    <template v-else-if="daily">
      <Card data-testid="daily-chart-card">
        <template #title>Time per day</template>
        <template #subtitle>
          <span data-testid="daily-total" class="font-semibold text-surface-800 dark:text-surface-100">
            {{ formatDurationBadge(daily.totalSeconds) }}
          </span>
          from {{ formatDay(daily.start) }} to {{ formatDay(daily.end) }}
        </template>
        <template #content>
          <DailyTimeChart :days="daily.days" :selected-day="selectedDay" @select="selectDay" />
        </template>
      </Card>

      <!-- The range's time per tag and per priority -->
      <TimeBreakdownCards :breakdown="daily.breakdown" />

      <!-- The range's entries, by day: the chart's values without the chart. -->
      <Card data-testid="day-entries-card">
        <template #title>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span>Entries</span>
            <Button
              v-if="selectedDay"
              label="Show all days"
              icon="pi pi-times"
              severity="secondary"
              size="small"
              text
              data-testid="show-all-days"
              @click="selectedDay = null"
            />
          </div>
        </template>
        <template #subtitle>
          <span data-testid="entries-scope">
            {{ selectedDay
              ? `${formatDay(selectedDay)} only`
              : 'Every day in the range, newest first. Select a day in the chart to see only that day.' }}
          </span>
        </template>
        <template #content>
          <div class="flex flex-col gap-5">
            <section v-for="day in visibleDays" :key="day.day" data-testid="entries-day">
              <h3 class="mb-1 flex items-baseline justify-between gap-3 text-sm font-semibold text-surface-800 dark:text-surface-100">
                <span>{{ formatDay(day.day) }}</span>
                <span class="tabular-nums text-surface-600 dark:text-surface-300">
                  {{ day.totalSeconds ? formatDurationBadge(day.totalSeconds) : 'No time' }}
                </span>
              </h3>
              <DayTimeEntries :day="day" :timezone="daily.timezone" />
            </section>
          </div>
        </template>
        <template v-if="entryCount > ENTRY_LIMITS[0]!.value" #footer>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-3 dark:border-surface-700">
            <span data-testid="entries-count" class="text-sm text-surface-500 dark:text-surface-400">
              Showing {{ visibleEntryCount }} of {{ entryCount }} entries
            </span>
            <SelectButton
              v-model="entryLimit"
              :options="ENTRY_LIMITS"
              option-label="label"
              option-value="value"
              :allow-empty="false"
              size="small"
              aria-label="Entries shown"
              data-testid="entries-limit"
            />
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup lang="ts">
import {analyticsApi, type DayRange, type DayTimeDto} from '~/api/analytics'
import DailyTimeChart from '~/components/analytics/DailyTimeChart.vue'
import DayTimeEntries from '~/components/analytics/DayTimeEntries.vue'
import TimeBreakdownCards from '~/components/analytics/TimeBreakdownCards.vue'
import {formatDurationBadge} from '~/composables/useTaskTimer'
import {addDays, countDays, formatDay, fromDay, toDay, todayIn} from '~/utils/days'

const PRESETS = [
  {label: '7 days', days: 7},
  {label: '30 days', days: 30},
  {label: '90 days', days: 90},
]
// Matches the backend's limit.
const MAX_RANGE_DAYS = 90

const authStore = useAuthStore()
const notify = useNotifications()

// "Today" is today in the profile timezone, which the backend groups days by.
const today = computed(() => todayIn(authStore.user?.timezone || 'UTC'))

const preset = ref<number | null>(7)
const customRange = ref<(Date | null)[] | null>(null)

// Picking a preset clears the custom range, and completing a custom range clears the preset.
watch(preset, value => {
  if (value !== null) customRange.value = null
})
watch(customRange, value => {
  if (value?.[0] && value[1]) preset.value = null
})

const customDays = computed<DayRange | null>(() => {
  const [start, end] = customRange.value ?? []
  return start && end ? {start: toDay(start), end: toDay(end)} : null
})

const rangeError = computed(() => {
  const custom = customDays.value
  if (preset.value === null && custom && countDays(custom.start, custom.end) > MAX_RANGE_DAYS) {
    return `Choose a range of ${MAX_RANGE_DAYS} days or fewer.`
  }
  return null
})

// The range to load. It only changes once a choice is complete and valid, so the
// page keeps showing the last range while a custom range is half picked.
const activeRange = ref<DayRange>({start: addDays(today.value, -6), end: today.value})
watch([preset, customDays, rangeError], () => {
  if (preset.value !== null) {
    activeRange.value = {start: addDays(today.value, -(preset.value - 1)), end: today.value}
  } else if (customDays.value && !rangeError.value) {
    activeRange.value = customDays.value
  }
})

const {
  data: daily,
  status,
  error,
  refresh,
} = await useAsyncData(
  'personal-analytics',
  () => analyticsApi.getDailyTime(activeRange.value),
  {watch: [activeRange]},
)

watch(error, value => {
  if (value) notify.error(value, 'Unable to load your tracked time')
}, {immediate: true})

// The day picked in the chart, or null to list every day in the range.
const selectedDay = ref<string | null>(null)

// Clicking the selected day again shows every day.
function selectDay(day: string) {
  selectedDay.value = selectedDay.value === day ? null : day
}

// A new range clears a selected day that's no longer in it.
watch(daily, value => {
  if (value && !value.days.some(day => day.day === selectedDay.value)) {
    selectedDay.value = null
  }
})

// The selected day, or every day with tracked time, newest first.
const shownDays = computed<DayTimeDto[]>(() => {
  const days = daily.value?.days ?? []
  if (selectedDay.value) return days.filter(day => day.day === selectedDay.value)
  return days.filter(day => day.totalSeconds > 0).reverse()
})

// How many entries the list shows at once, so a long range isn't overwhelming.
const ENTRY_LIMITS = [
  {label: '20', value: 20},
  {label: '50', value: 50},
  {label: '100', value: 100},
  {label: 'All', value: Number.POSITIVE_INFINITY},
]
const entryLimit = ref(ENTRY_LIMITS[0]!.value)

const entryCount = computed(() => shownDays.value.reduce((sum, day) => sum + day.entries.length, 0))
const visibleEntryCount = computed(() => Math.min(entryCount.value, entryLimit.value))

// The shown days, cut off after the limit. A day keeps its full total even when
// only some of its entries fit; a selected day with no entries stays to say so.
const visibleDays = computed<DayTimeDto[]>(() => {
  let remaining = entryLimit.value
  const days: DayTimeDto[] = []
  for (const day of shownDays.value) {
    if (remaining <= 0) break
    const entries = day.entries.slice(0, remaining)
    remaining -= entries.length
    if (entries.length || !day.entries.length) days.push({...day, entries})
  }
  return days
})
</script>
