import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import type { TaskAveragesDto } from '~/api/analytics'
import TaskAverages from '~/components/analytics/TaskAverages.vue'

function mountAverages(overrides: Partial<TaskAveragesDto> = {}) {
  return mount(TaskAverages, {
    props: {
      averages: {
        taskCount: 4,
        sessionCount: 10,
        averageTaskSeconds: 5400,
        averageSessionSeconds: 1500,
        averageSessionsPerTask: 2.5,
        ...overrides,
      },
    },
    global: { plugins: [PrimeVue] },
  })
}

const values = (wrapper: ReturnType<typeof mountAverages>) =>
  wrapper.findAll('[data-testid="analytics-average"] dd').map(value => value.text())

describe('TaskAverages', () => {
  it('shows time per task, session length and sessions per task', () => {
    const wrapper = mountAverages()

    expect(values(wrapper)).toEqual(['1h 30m', '25m', '2.5'])
    expect(wrapper.text()).toContain('Across 4 tasks with tracked time and 10 sessions')
  })

  it('uses the singular for one task and one session', () => {
    const wrapper = mountAverages({ taskCount: 1, sessionCount: 1, averageSessionsPerTask: 1 })

    expect(wrapper.text()).toContain('Across 1 task with tracked time and 1 session')
  })

  it('shows a dash for averages that have no value', () => {
    const wrapper = mountAverages({
      taskCount: 0,
      sessionCount: 0,
      averageTaskSeconds: null,
      averageSessionSeconds: null,
      averageSessionsPerTask: null,
    })

    expect(values(wrapper)).toEqual(['—', '—', '—'])
  })
})
