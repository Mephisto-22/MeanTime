import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { ChartData, ChartOptions } from 'chart.js'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import type { DayTimeDto } from '~/api/analytics'
import DailyTimeChart from '~/components/analytics/DailyTimeChart.vue'

// Chart.js draws on a canvas, which happy-dom doesn't support, so the tests
// check what the component passes to PrimeVue's Chart instead.
const ChartStub = defineComponent({
  name: 'Chart',
  props: ['type', 'data', 'options', 'canvasProps'],
  setup: () => () => h('div'),
})

function day(date: string, totalSeconds: number): DayTimeDto {
  return { day: date, totalSeconds, entries: [] }
}

const WEEK = [
  day('2026-11-09', 3600),
  day('2026-11-10', 0),
  day('2026-11-11', 5400),
]

async function mountChart(days: DayTimeDto[], selectedDay: string | null = null) {
  const wrapper = await mountSuspended(DailyTimeChart, {
    props: { days, selectedDay },
    global: { stubs: { Chart: ChartStub } },
  })
  const chart = wrapper.findComponent(ChartStub)
  return {
    wrapper,
    data: chart.props('data') as ChartData<'bar'>,
    options: chart.props('options') as ChartOptions<'bar'>,
    canvasProps: chart.props('canvasProps') as Record<string, string>,
  }
}

describe('Daily time chart (#173)', () => {
  it('draws one bar per day, labelled by weekday for a short range', async () => {
    const { data } = await mountChart(WEEK)

    expect(data.labels).toEqual(['Mon 9', 'Tue 10', 'Wed 11'])
    expect(data.datasets[0]!.data).toEqual([1, 0, 1.5])
  })

  it('labels a long range by month and day', async () => {
    const days = Array.from({ length: 15 }, (_, index) =>
      day(`2026-11-${String(index + 1).padStart(2, '0')}`, 60))

    const { data } = await mountChart(days)

    expect(data.labels![0]).toBe('Nov 1')
  })

  it('counts the axis in hours once a day reaches an hour', async () => {
    const { options } = await mountChart(WEEK)

    const tick = options.scales!.y!.ticks!.callback as (value: number) => string
    expect(tick(2)).toBe('2h')
  })

  it('counts the axis in minutes when every day is under an hour', async () => {
    const { data, options } = await mountChart([day('2026-11-09', 1800), day('2026-11-10', 600)])

    expect(data.datasets[0]!.data).toEqual([30, 10])
    const tick = options.scales!.y!.ticks!.callback as (value: number) => string
    expect(tick(30)).toBe('30m')
  })

  it('keeps bars thin with rounded tops and square baselines', async () => {
    const { data } = await mountChart(WEEK)

    const dataset = data.datasets[0]!
    expect(dataset.maxBarThickness).toBe(24)
    expect(dataset.borderRadius).toBe(4)
    expect(dataset.borderSkipped).toBe('start')
  })

  it('fades the days that are not selected', async () => {
    const { data } = await mountChart(WEEK, '2026-11-11')

    const colors = data.datasets[0]!.backgroundColor as string[]
    expect(colors[2]).toBe('#3987e5')
    expect(colors[0]).not.toBe('#3987e5')
    expect(colors[1]).toBe(colors[0])
  })

  it('shows every bar at full color when no day is selected', async () => {
    const { data } = await mountChart(WEEK)

    expect(data.datasets[0]!.backgroundColor).toEqual(['#3987e5', '#3987e5', '#3987e5'])
  })

  it('selects the day whose column is clicked', async () => {
    const { wrapper, options } = await mountChart(WEEK)

    const onClick = options.onClick as (event: unknown, elements: { index: number }[]) => void
    onClick({}, [{ index: 1 }])
    onClick({}, [])

    expect(wrapper.emitted('select')).toEqual([['2026-11-10']])
  })

  it('leads the tooltip with the time and follows with the day', async () => {
    const { options } = await mountChart(WEEK)

    const callbacks = options.plugins!.tooltip!.callbacks! as unknown as {
      title: (items: { dataIndex: number }[]) => string
      label: (item: { dataIndex: number }) => string
    }
    expect(callbacks.title([{ dataIndex: 2 }])).toBe('1h 30m')
    expect(callbacks.label({ dataIndex: 2 })).toBe('Wed, Nov 11')
  })

  it('describes the chart for screen readers', async () => {
    const { canvasProps } = await mountChart(WEEK)

    expect(canvasProps.role).toBe('img')
    expect(canvasProps['aria-label']).toContain('from Mon, Nov 9 to Wed, Nov 11')
  })
})
