import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import type { TaskTimerDto, TaskTimeEntryDto } from '~/api/kanban'
import TaskTimerEditor from '~/components/kanban/TaskTimerEditor.vue'

describe('Activity Chronicle & Past Work Journal (#108)', () => {
  const defaultTimer: TaskTimerDto = {
    taskId: 'chronicle-task-1',
    mode: 'COUNT_DOWN',
    targetDurationSeconds: 1500,
    state: 'IDLE',
    startedAt: null,
    elapsedSeconds: 0,
  }

  it('displays session count and aggregated duration badge', () => {
    const entries: TaskTimeEntryDto[] = [
      {
        id: 'entry-1',
        taskId: 'chronicle-task-1',
        startedAt: '2026-11-01T10:00:00.000Z',
        endedAt: '2026-11-01T10:45:00.000Z',
        durationSeconds: 2700, // 45m
        note: 'Sprint planning',
      },
      {
        id: 'entry-2',
        taskId: 'chronicle-task-1',
        startedAt: '2026-11-01T14:00:00.000Z',
        endedAt: '2026-11-01T15:15:00.000Z',
        durationSeconds: 4500, // 1h 15m
        note: 'Code review',
      },
    ]

    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 'chronicle-task-1',
        timer: defaultTimer,
        timeEntries: entries,
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    // (2) sessions, 2700 + 4500 = 7200s = 2h total
    expect(wrapper.text()).toContain('(2)')
    expect(wrapper.text()).toContain('2h total')

    // Renders notes and time ranges
    expect(wrapper.text()).toContain('Sprint planning')
    expect(wrapper.text()).toContain('Code review')
    expect(wrapper.text()).toContain('45m')
    expect(wrapper.text()).toContain('1h 15m')
  })

  it('logs past work via 3-tier form and emits update:timeEntries with recalculated duration', async () => {
    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 'chronicle-task-1',
        timer: defaultTimer,
        timeEntries: [],
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    // Initially 0 entries
    expect(wrapper.text()).toContain('(0)')

    // Toggle form open
    const toggleBtn = wrapper.find('[data-testid="btn-toggle-log-past-work"]')
    await toggleBtn.trigger('click')

    expect(wrapper.find('[data-testid="manual-work-form"]').exists()).toBe(true)

    const dateInput = wrapper.find('[data-testid="manual-input-date"]')
    const startTimeInput = wrapper.find('[data-testid="manual-input-start-time"]')
    const endTimeInput = wrapper.find('[data-testid="manual-input-end-time"]')
    const durationInput = wrapper.find('[data-testid="manual-input-duration"]')
    const noteInput = wrapper.find('[data-testid="manual-input-note"]')

    expect(dateInput.exists()).toBe(true)
    expect(startTimeInput.exists()).toBe(true)
    expect(endTimeInput.exists()).toBe(true)
    expect(durationInput.exists()).toBe(true)
    expect(noteInput.exists()).toBe(true)

    // Set note and save
    await noteInput.setValue('Refactored domain models')
    const saveBtn = wrapper.find('[data-testid="manual-save-btn"]')
    await saveBtn.trigger('click')

    expect(wrapper.emitted('update:timeEntries')).toBeTruthy()
    const updatedEntries = wrapper.emitted('update:timeEntries')!.at(-1)![0] as TaskTimeEntryDto[]
    expect(updatedEntries.length).toBe(1)
    expect(updatedEntries[0].note).toBe('Refactored domain models')
    expect(updatedEntries[0].durationSeconds).toBeGreaterThan(0)
  })

  it('supports inline editing of past sessions with duration-anchored recalculation', async () => {
    const initialEntry: TaskTimeEntryDto = {
      id: 'session-edit-1',
      taskId: 'chronicle-task-1',
      startedAt: '2026-11-01T10:00:00.000Z',
      endedAt: '2026-11-01T10:30:00.000Z',
      durationSeconds: 1800,
      note: 'Initial focus period',
    }

    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 'chronicle-task-1',
        timer: defaultTimer,
        timeEntries: [initialEntry],
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    // Click edit button for the session
    const editBtn = wrapper.find('[data-testid="btn-edit-session-session-edit-1"]')
    expect(editBtn.exists()).toBe(true)
    await editBtn.trigger('click')

    // Inline editor is visible
    expect(wrapper.find('[data-testid="inline-session-editor"]').exists()).toBe(true)

    const editNote = wrapper.find('[data-testid="edit-session-note"]')
    await editNote.setValue('Updated focus notes')

    const saveEditBtn = wrapper.find('[data-testid="btn-save-session-edits"]')
    await saveEditBtn.trigger('click')

    expect(wrapper.emitted('update:timeEntries')).toBeTruthy()
    const entries = wrapper.emitted('update:timeEntries')!.at(-1)![0] as TaskTimeEntryDto[]
    expect(entries[0].note).toBe('Updated focus notes')
  })

  it('deletes recorded time entries and updates session count immediately', async () => {
    const initialEntry: TaskTimeEntryDto = {
      id: 'session-del-1',
      taskId: 'chronicle-task-1',
      startedAt: '2026-11-01T10:00:00.000Z',
      endedAt: '2026-11-01T10:30:00.000Z',
      durationSeconds: 1800,
      note: 'To be deleted',
    }

    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 'chronicle-task-1',
        timer: defaultTimer,
        timeEntries: [initialEntry],
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    const deleteBtn = wrapper.find('[data-testid="btn-delete-session-session-del-1"]')
    expect(deleteBtn.exists()).toBe(true)
    await deleteBtn.trigger('click')

    expect(wrapper.emitted('update:timeEntries')).toBeTruthy()
    const entries = wrapper.emitted('update:timeEntries')!.at(-1)![0] as TaskTimeEntryDto[]
    expect(entries).toHaveLength(0)
  })
})
