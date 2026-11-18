import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { analyticsApi, type DailyTimeDto, type DayEntryDto } from '~/api/analytics'
import DailyTimeChart from '~/components/analytics/DailyTimeChart.vue'
import AnalyticsPage from '~/pages/analytics.vue'
import { useAuthStore } from '~/stores/auth'
import { addDays, todayIn } from '~/utils/days'

// Chart.js needs a canvas, which happy-dom doesn't support.
const ChartStub = defineComponent({
  name: 'Chart',
  props: ['type', 'data', 'options', 'canvasProps'],
  setup: () => () => h('div'),
})

beforeEach(() => {
  useAuthStore().$patch({
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    sessionInitialized: true,
    user: {
      id: 1,
      email: 'me@example.com',
      display_name: 'Me',
      timezone: 'UTC',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  })
  // Each test loads its own data instead of reusing the last test's.
  clearNuxtData('personal-analytics')
})

function entry(id: number, taskTitle: string, startedAt: string, durationSeconds: number): DayEntryDto {
  return {
    id,
    taskId: id * 10,
    taskTitle,
    boardId: 7,
    boardTitle: 'Sprint Board',
    startedAt,
    endedAt: null,
    durationSeconds,
    note: '',
  }
}

function dailyFixture(overrides: Partial<DailyTimeDto> = {}): DailyTimeDto {
  return {
    start: '2026-11-09',
    end: '2026-11-11',
    timezone: 'UTC',
    totalSeconds: 9000,
    days: [
      { day: '2026-11-09', totalSeconds: 3600, entries: [entry(1, 'Plan sprint', '2026-11-09T09:00:00Z', 3600)] },
      { day: '2026-11-10', totalSeconds: 0, entries: [] },
      { day: '2026-11-11', totalSeconds: 5400, entries: [entry(2, 'Write tests', '2026-11-11T13:00:00Z', 5400)] },
    ],
    breakdown: {
      tags: [{ name: 'tests', totalSeconds: 5400 }, { name: null, totalSeconds: 3600 }],
      priorities: [{ name: 'HIGH', totalSeconds: 5400 }, { name: null, totalSeconds: 3600 }],
    },
    ...overrides,
  }
}

// Every page instance shares the 'personal-analytics' data, so each test's page is
// unmounted afterwards rather than left to answer the next test's refreshes.
const mounted: { unmount: () => void }[] = []

async function mountPage() {
  const wrapper = await mountSuspended(AnalyticsPage, {
    route: '/analytics',
    global: { stubs: { Chart: ChartStub } },
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('Personal analytics page (/analytics)', () => {
  afterEach(() => {
    mounted.splice(0).forEach(wrapper => wrapper.unmount())
    vi.restoreAllMocks()
  })

  it('loads the last 7 days in the profile timezone by default', async () => {
    const spy = vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())

    await mountPage()

    const today = todayIn('UTC')
    expect(spy).toHaveBeenCalledWith({ start: addDays(today, -6), end: today })
  })

  it('shows the total, the chart and every tracked day in the range, newest first', async () => {
    vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="daily-total"]').text()).toBe('2h 30m')
    expect(wrapper.findComponent(ChartStub).props('data').datasets[0].data).toEqual([1, 0, 1.5])
    expect(wrapper.findComponent(DailyTimeChart).props('selectedDay')).toBeNull()
    expect(wrapper.find('[data-testid="show-all-days"]').exists()).toBe(false)

    // The day with no tracked time is left out.
    const days = wrapper.findAll('[data-testid="entries-day"]')
    expect(days.map(day => day.find('h3').text())).toEqual([
      expect.stringMatching(/^Wed, Nov 11\s*1h 30m$/),
      expect.stringMatching(/^Mon, Nov 9\s*1h$/),
    ])
    expect(days[0]!.text()).toContain('Write tests')
    expect(days[1]!.text()).toContain('Plan sprint')
    expect(wrapper.find('[data-testid="day-select"]').exists()).toBe(false)
  })

  it('shows the range\'s time per tag and per priority (#191)', async () => {
    vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())

    const wrapper = await mountPage()

    const tagChart = wrapper.find('[data-testid="breakdown-tags"]').findComponent(ChartStub)
    expect(tagChart.props('data').labels).toEqual(['tests', 'None'])
    const priorityChart = wrapper.find('[data-testid="breakdown-priorities"]').findComponent(ChartStub)
    expect(priorityChart.props('data').labels).toEqual(['High', 'None'])
  })

  describe('entry limit', () => {
    // 15 entries on Nov 11 and 10 on Nov 9: 25 in all.
    function busyFixture(): DailyTimeDto {
      const entriesOn = (day: string, count: number, firstId: number) =>
        Array.from({ length: count }, (_, index) =>
          entry(firstId + index, `Task ${firstId + index}`, `${day}T09:00:00Z`, 60))
      return dailyFixture({
        totalSeconds: 1500,
        days: [
          { day: '2026-11-09', totalSeconds: 600, entries: entriesOn('2026-11-09', 10, 100) },
          { day: '2026-11-10', totalSeconds: 0, entries: [] },
          { day: '2026-11-11', totalSeconds: 900, entries: entriesOn('2026-11-11', 15, 200) },
        ],
      })
    }

    it('shows the first 20 entries and says how many there are', async () => {
      vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(busyFixture())

      const wrapper = await mountPage()

      expect(wrapper.findAll('[data-testid="day-entry"]')).toHaveLength(20)
      expect(wrapper.find('[data-testid="entries-count"]').text()).toBe('Showing 20 of 25 entries')
      // Nov 9 only fits 5 of its entries but keeps its full total.
      const days = wrapper.findAll('[data-testid="entries-day"]')
      expect(days).toHaveLength(2)
      expect(days[1]!.findAll('[data-testid="day-entry"]')).toHaveLength(5)
      expect(days[1]!.find('h3').text()).toMatch(/10m$/)
    })

    it('shows more entries when a larger limit is chosen', async () => {
      vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(busyFixture())
      const wrapper = await mountPage()
      const limit = wrapper.findComponent('[data-testid="entries-limit"]')

      limit.vm.$emit('update:modelValue', 50)
      await flushPromises()
      expect(wrapper.findAll('[data-testid="day-entry"]')).toHaveLength(25)
      expect(wrapper.find('[data-testid="entries-count"]').text()).toBe('Showing 25 of 25 entries')

      limit.vm.$emit('update:modelValue', Number.POSITIVE_INFINITY)
      await flushPromises()
      expect(wrapper.findAll('[data-testid="day-entry"]')).toHaveLength(25)
    })

    it('hides the limit buttons when there are 20 entries or fewer', async () => {
      vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())

      const wrapper = await mountPage()

      expect(wrapper.find('[data-testid="entries-limit"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="entries-count"]').exists()).toBe(false)
    })
  })

  it('narrows the entries to the day selected in the chart', async () => {
    vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())
    const wrapper = await mountPage()

    wrapper.findComponent(DailyTimeChart).vm.$emit('select', '2026-11-09')
    await flushPromises()

    const days = wrapper.findAll('[data-testid="entries-day"]')
    expect(days).toHaveLength(1)
    expect(days[0]!.text()).toContain('Plan sprint')
    expect(wrapper.find('[data-testid="entries-scope"]').text()).toBe('Mon, Nov 9 only')
    expect(wrapper.findComponent(DailyTimeChart).props('selectedDay')).toBe('2026-11-09')
  })

  it('shows that a selected day has no tracked time', async () => {
    vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())
    const wrapper = await mountPage()

    wrapper.findComponent(DailyTimeChart).vm.$emit('select', '2026-11-10')
    await flushPromises()

    expect(wrapper.find('[data-testid="day-entries-empty"]').text())
      .toBe('No time tracked on Tue, Nov 10.')
  })

  it('goes back to every day with Show all days or by selecting the day again', async () => {
    vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())
    const wrapper = await mountPage()
    const chart = wrapper.findComponent(DailyTimeChart)

    chart.vm.$emit('select', '2026-11-09')
    await flushPromises()
    await wrapper.find('[data-testid="show-all-days"]').trigger('click')
    expect(wrapper.findAll('[data-testid="entries-day"]')).toHaveLength(2)

    chart.vm.$emit('select', '2026-11-11')
    await flushPromises()
    chart.vm.$emit('select', '2026-11-11')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="entries-day"]')).toHaveLength(2)
    expect(chart.props('selectedDay')).toBeNull()
  })

  it('reloads when a longer preset is chosen', async () => {
    const spy = vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())
    const wrapper = await mountPage()

    wrapper.findComponent({ name: 'SelectButton' }).vm.$emit('update:modelValue', 30)
    await flushPromises()

    const today = todayIn('UTC')
    expect(spy).toHaveBeenLastCalledWith({ start: addDays(today, -29), end: today })
  })

  it('loads a custom range once both days are picked', async () => {
    const spy = vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())
    const wrapper = await mountPage()
    const picker = wrapper.findComponent({ name: 'DatePicker' })

    picker.vm.$emit('update:modelValue', [new Date(2026, 10, 2), null])
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(1)

    picker.vm.$emit('update:modelValue', [new Date(2026, 10, 2), new Date(2026, 10, 8)])
    await flushPromises()

    expect(spy).toHaveBeenLastCalledWith({ start: '2026-11-02', end: '2026-11-08' })
    expect(wrapper.findComponent({ name: 'SelectButton' }).props('modelValue')).toBeNull()
  })

  it('warns about a custom range over 90 days and keeps the current one', async () => {
    const spy = vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture())
    const wrapper = await mountPage()

    wrapper.findComponent({ name: 'DatePicker' }).vm.$emit(
      'update:modelValue', [new Date(2026, 0, 1), new Date(2026, 5, 1)])
    await flushPromises()

    expect(wrapper.find('[data-testid="analytics-range-error"]').text())
      .toBe('Choose a range of 90 days or fewer.')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when no time was tracked in the range', async () => {
    vi.spyOn(analyticsApi, 'getDailyTime').mockResolvedValue(dailyFixture({
      totalSeconds: 0,
      days: [{ day: '2026-11-09', totalSeconds: 0, entries: [] }],
    }))

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="personal-analytics-empty"]').text())
      .toContain("You haven't tracked any time between Mon, Nov 9 and Wed, Nov 11.")
    expect(wrapper.find('[data-testid="daily-chart-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="analytics-range-presets"]').exists()).toBe(true)
  })

  it('shows an error with a retry that reloads', async () => {
    const spy = vi.spyOn(analyticsApi, 'getDailyTime')
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValue(dailyFixture())

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="personal-analytics-error"]').exists()).toBe(true)
    await wrapper.find('[data-testid="personal-analytics-error"] button').trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="personal-analytics-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="daily-chart-card"]').exists()).toBe(true)
  })
})
