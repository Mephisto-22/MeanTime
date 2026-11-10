import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { ColumnTimeDto } from '~/api/analytics'
import ColumnTimeShareChart from '~/components/analytics/ColumnTimeShareChart.vue'

function mountChart(columns: ColumnTimeDto[]) {
  const totalSeconds = columns.reduce((sum, column) => sum + column.totalSeconds, 0)
  return mount(ColumnTimeShareChart, { props: { columns, totalSeconds } })
}

function legendText(wrapper: ReturnType<typeof mountChart>): string[] {
  return wrapper.findAll('[data-testid="column-share-legend-item"]').map(item => item.text())
}

describe('Column time share donut (#168)', () => {
  it('draws one slice per tracked column with its share', () => {
    const wrapper = mountChart([
      { columnId: 1, title: 'To Do', totalSeconds: 900 },
      { columnId: 2, title: 'Doing', totalSeconds: 900 },
      { columnId: 3, title: 'Done', totalSeconds: 1800 },
    ])

    expect(wrapper.findAll('[data-testid="column-share-slice"]')).toHaveLength(3)
    expect(legendText(wrapper)).toEqual(['To Do25%', 'Doing25%', 'Done50%'])
  })

  it('leaves out columns with no tracked time', () => {
    const wrapper = mountChart([
      { columnId: 1, title: 'Backlog', totalSeconds: 0 },
      { columnId: 2, title: 'Done', totalSeconds: 600 },
    ])

    expect(wrapper.findAll('[data-testid="column-share-slice"]')).toHaveLength(1)
    expect(legendText(wrapper)).toEqual(['Done100%'])
  })

  it('folds the smallest columns into Other past five slices', () => {
    const wrapper = mountChart([
      { columnId: 1, title: 'A', totalSeconds: 100 },
      { columnId: 2, title: 'B', totalSeconds: 600 },
      { columnId: 3, title: 'C', totalSeconds: 500 },
      { columnId: 4, title: 'D', totalSeconds: 400 },
      { columnId: 5, title: 'E', totalSeconds: 300 },
      { columnId: 6, title: 'F', totalSeconds: 100 },
      { columnId: 7, title: 'G', totalSeconds: 200 },
    ])

    // The five largest stay in board order; A and F (100s each) become Other.
    expect(legendText(wrapper)).toEqual(['B27%', 'C23%', 'D18%', 'E14%', 'G9%', 'Other9%'])
  })

  it('shows the board total in the centre until a slice is hovered', async () => {
    const wrapper = mountChart([
      { columnId: 1, title: 'To Do', totalSeconds: 1800 },
      { columnId: 2, title: 'Done', totalSeconds: 3600 },
    ])
    const centreValue = () => wrapper.find('[data-testid="column-share-center-value"]').text()
    const centreLabel = () => wrapper.find('[data-testid="column-share-center-label"]').text()

    expect(centreValue()).toBe('1h 30m')

    await wrapper.findAll('[data-testid="column-share-slice"]')[1]!.trigger('mouseenter')
    expect(centreValue()).toBe('67%')
    expect(centreLabel()).toBe('Done')

    await wrapper.findAll('[data-testid="column-share-slice"]')[1]!.trigger('mouseleave')
    expect(centreValue()).toBe('1h 30m')
  })

  it('highlights a slice when its legend row is focused', async () => {
    const wrapper = mountChart([
      { columnId: 1, title: 'To Do', totalSeconds: 1800 },
      { columnId: 2, title: 'Done', totalSeconds: 3600 },
    ])

    await wrapper.findAll('[data-testid="column-share-legend-item"]')[0]!.trigger('focus')

    const slices = wrapper.findAll('[data-testid="column-share-slice"]')
    expect(slices[0]!.classes()).not.toContain('opacity-35')
    expect(slices[1]!.classes()).toContain('opacity-35')
    expect(wrapper.find('[data-testid="column-share-center-label"]').text()).toBe('To Do')
  })
})
