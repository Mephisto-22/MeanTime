import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { ChartData, ChartOptions } from 'chart.js'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import type { BreakdownRowDto } from '~/api/analytics'
import TimeBreakdownChart from '~/components/analytics/TimeBreakdownChart.vue'

// Chart.js draws on a canvas, which happy-dom doesn't support, so the tests
// check what the component passes to PrimeVue's Chart instead.
const ChartStub = defineComponent({
  name: 'Chart',
  props: ['type', 'data', 'options', 'canvasProps'],
  setup: () => () => h('div'),
})

async function mountChart(rows: BreakdownRowDto[], kind: 'tag' | 'priority' = 'tag') {
  const wrapper = await mountSuspended(TimeBreakdownChart, {
    props: { rows, kind },
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

const TAGS: BreakdownRowDto[] = [
  { name: 'backend', totalSeconds: 7200 },
  { name: 'docs', totalSeconds: 1800 },
  { name: null, totalSeconds: 3600 },
]

describe('Time breakdown chart (#191)', () => {
  it('draws one horizontal bar per tag, in the order given, with "None" for untagged time', async () => {
    const { data, options } = await mountChart(TAGS)

    expect(options.indexAxis).toBe('y')
    expect(data.labels).toEqual(['backend', 'docs', 'None'])
    expect(data.datasets[0]!.data).toEqual([2, 0.5, 1])
  })

  it('names priorities by their label', async () => {
    const { data } = await mountChart([
      { name: 'HIGH', totalSeconds: 600 },
      { name: 'LOW', totalSeconds: 300 },
      { name: null, totalSeconds: 60 },
    ], 'priority')

    expect(data.labels).toEqual(['High', 'Low', 'None'])
  })

  it('colours the "None" bar grey and the rest blue', async () => {
    const { data } = await mountChart(TAGS)

    expect(data.datasets[0]!.backgroundColor).toEqual(['#3987e5', '#3987e5', '#71717a'])
  })

  it('counts in minutes until a bar reaches an hour', async () => {
    const { data, options } = await mountChart([{ name: 'docs', totalSeconds: 1800 }])

    expect(data.datasets[0]!.data).toEqual([30])
    const tick = (options.scales!.x!.ticks as { callback: (value: number) => string }).callback
    expect(tick(30)).toBe('30m')
  })

  it('shows the duration in the tooltip', async () => {
    const { options } = await mountChart(TAGS)
    const callbacks = options.plugins!.tooltip!.callbacks as {
      title: (items: { dataIndex: number }[]) => string
      label: (item: { dataIndex: number }) => string
    }

    expect(callbacks.title([{ dataIndex: 1 }])).toBe('docs')
    expect(callbacks.label({ dataIndex: 1 })).toBe('30m')
  })

  it('grows with the number of rows and describes every value for screen readers', async () => {
    const { wrapper, canvasProps } = await mountChart(TAGS)

    expect(wrapper.find('[data-testid="time-breakdown-chart"]').attributes('style')).toContain('height: 128px')
    expect(canvasProps['aria-label']).toBe('Bar chart of tracked time per tag: backend 2h, docs 30m, None 1h')
  })
})
