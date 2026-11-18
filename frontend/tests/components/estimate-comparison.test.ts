import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { EstimatesDto, TaskEstimateDto } from '~/api/analytics'
import EstimateComparison from '~/components/analytics/EstimateComparison.vue'

function estimate(title: string, plannedSeconds: number, actualSeconds: number, taskId = title.length): TaskEstimateDto {
  return {
    taskId,
    title,
    columnId: 10,
    columnTitle: 'In Progress',
    plannedSeconds,
    actualSeconds,
    differenceSeconds: actualSeconds - plannedSeconds,
  }
}

function mountComparison(overrides: Partial<EstimatesDto> = {}) {
  const estimates: EstimatesDto = {
    tasks: [
      estimate('Over', 1500, 1800, 1),
      estimate('On', 1500, 1500, 2),
      estimate('Under', 1500, 1200, 3),
    ],
    averageDifferencePercent: 0,
    trackedTaskCount: 3,
    ...overrides,
  }
  return mountSuspended(EstimateComparison, { props: { estimates } })
}

function tableRows(wrapper: Awaited<ReturnType<typeof mountComparison>>) {
  return wrapper.findAll('[data-testid="estimate-table"] tbody tr')
}

describe('EstimateComparison', () => {
  it('lists planned, actual and the difference for each task, most over first', async () => {
    const wrapper = await mountComparison()

    const rows = tableRows(wrapper)
    expect(rows).toHaveLength(3)
    expect(rows[0]!.text()).toContain('Over')
    expect(rows[0]!.text()).toContain('In Progress')
    expect(rows[0]!.text()).toContain('25m')
    expect(rows[0]!.text()).toContain('30m')
    expect(rows[0]!.text()).toContain('+5m')
    expect(rows[1]!.text()).toContain('On target')
    expect(rows[2]!.text()).toContain('−5m')
  })

  it('highlights only the tasks over their target, with a tag as well as a tint', async () => {
    const wrapper = await mountComparison()

    const rows = tableRows(wrapper)
    expect(rows[0]!.classes()).toContain('estimate-over-row')
    expect(rows[0]!.find('[data-testid="estimate-over-tag"]').text()).toContain('Over')
    for (const row of rows.slice(1)) {
      expect(row.classes()).not.toContain('estimate-over-row')
      expect(row.find('[data-testid="estimate-over-tag"]').exists()).toBe(false)
    }
  })

  it('sorts by a column when its header is clicked', async () => {
    const wrapper = await mountComparison({
      tasks: [estimate('Beta', 600, 900, 1), estimate('Alpha', 3600, 1800, 2)],
    })

    await wrapper.findAll('[data-testid="estimate-table"] th')[0]!.trigger('click')

    expect(tableRows(wrapper).map(row => row.text())).toEqual([
      expect.stringContaining('Alpha'),
      expect.stringContaining('Beta'),
    ])
  })

  it('shows five tasks at first, with buttons to show more', async () => {
    const tasks = Array.from({ length: 12 }, (_, i) => estimate(`Task ${i}`, 600, 600 + i, i + 1))
    const wrapper = await mountComparison({ tasks })

    expect(tableRows(wrapper)).toHaveLength(5)
    expect(wrapper.find('[data-testid="row-limit-count"]').text()).toBe('Showing 5 of 12 tasks')

    const buttons = wrapper.findAll('[data-testid="row-limit-select"] button')
    expect(buttons.map(button => button.text())).toEqual(['5', '10', '25', 'All'])
    await buttons[1]!.trigger('click')
    expect(tableRows(wrapper)).toHaveLength(10)
    await buttons[3]!.trigger('click')
    expect(tableRows(wrapper)).toHaveLength(12)
    expect(wrapper.find('[data-testid="row-limit-count"]').text()).toBe('Showing 12 of 12 tasks')
  })

  it('sorts every task, not just the ones shown', async () => {
    const tasks = Array.from({ length: 7 }, (_, i) => estimate(`Task ${i}`, 600, 600 + i, i + 1))
    const wrapper = await mountComparison({ tasks })
    expect(tableRows(wrapper)[0]!.text()).toContain('Task 6')

    // Difference, already sorted most over first: one click reverses it.
    await wrapper.findAll('[data-testid="estimate-table"] th')[3]!.trigger('click')

    expect(tableRows(wrapper)).toHaveLength(5)
    expect(tableRows(wrapper)[0]!.text()).toContain('Task 0')
  })

  it('has no show-more buttons with five tasks or fewer', async () => {
    const wrapper = await mountComparison()

    expect(wrapper.find('[data-testid="row-limit-select"]').exists()).toBe(false)
  })

  it.each([
    [20, '20% over'],
    [-10, '10% under'],
    [0, 'On target'],
  ])('shows an average of %i%% as "%s"', async (averageDifferencePercent, label) => {
    const wrapper = await mountComparison({ averageDifferencePercent })

    expect(wrapper.find('[data-testid="estimate-accuracy-value"]').text()).toBe(label)
  })

  it('shows the accuracy in the same card as the table, marked as countdown', async () => {
    const wrapper = await mountComparison({ averageDifferencePercent: 20 })

    const card = wrapper.find('[data-testid="estimate-comparison"]')
    expect(card.text()).toContain('Planned vs actual (countdown)')
    expect(card.find('[data-testid="estimate-accuracy"]').text()).toContain('Estimate accuracy')
    expect(card.find('[data-testid="estimate-table"]').exists()).toBe(true)
  })

  it('says how many tasks the average covers', async () => {
    const one = await mountComparison({ averageDifferencePercent: 5, trackedTaskCount: 1 })
    const three = await mountComparison({ averageDifferencePercent: 5, trackedTaskCount: 3 })

    expect(one.find('[data-testid="estimate-accuracy"]').text()).toContain('across 1 task with tracked time')
    expect(three.find('[data-testid="estimate-accuracy"]').text()).toContain('across 3 tasks with tracked time')
  })

  it('explains the empty average when no countdown task has tracked time', async () => {
    const wrapper = await mountComparison({
      tasks: [estimate('Not started', 1500, 0)],
      averageDifferencePercent: null,
      trackedTaskCount: 0,
    })

    expect(wrapper.find('[data-testid="estimate-accuracy-value"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="estimate-accuracy-empty"]').exists()).toBe(true)
    expect(tableRows(wrapper)).toHaveLength(1)
  })

  it('explains how to get a comparison when no task has a countdown target', async () => {
    const wrapper = await mountComparison({ tasks: [], averageDifferencePercent: null, trackedTaskCount: 0 })

    expect(wrapper.find('[data-testid="estimate-table"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="estimate-accuracy"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="estimate-empty"]').text()).toContain('countdown target')
  })
})
