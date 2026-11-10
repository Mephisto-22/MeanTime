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

  it('correctly handles raw snake_case entries from backend API without displaying NaN', async () => {
    const rawBackendEntries: any[] = [
      {
        id: 101,
        task_id: 42,
        user_id: 1,
        started_at: '2026-11-01T10:00:00.000Z',
        ended_at: '2026-11-01T10:25:00.000Z',
        duration_seconds: 1500,
        note: 'Sprint planning from server',
        created_at: '2026-11-01T10:25:00.000Z',
      },
      {
        id: 102,
        task_id: 42,
        user_id: 1,
        started_at: '2026-11-01T14:00:00.000Z',
        ended_at: '2026-11-01T14:45:00.000Z',
        duration_seconds: 2700,
        note: 'API development from server',
        created_at: '2026-11-01T14:45:00.000Z',
      },
    ]

    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 42,
        timer: defaultTimer,
        timeEntries: rawBackendEntries as any,
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    expect(wrapper.text()).not.toContain('NaN')
    expect(wrapper.text()).toContain('(2)')
    expect(wrapper.text()).toContain('1h 10m total')
    expect(wrapper.text()).toContain('25m')
    expect(wrapper.text()).toContain('45m')
    expect(wrapper.text()).toContain('Sprint planning from server')
    expect(wrapper.text()).toContain('API development from server')

    const editBtn = wrapper.find('[data-testid="btn-edit-session-101"]')
    expect(editBtn.exists()).toBe(true)
    await editBtn.trigger('click')

    const durationInput = wrapper.find('[data-testid="edit-session-duration"]')
    expect(durationInput.text()).not.toContain('NaN')
    expect(wrapper.html()).not.toContain('NaN')
  })

  it('renders pause indicator when session span exceeds active duration', () => {
    const entries: TaskTimeEntryDto[] = [
      {
        id: 'entry-paused',
        taskId: 'chronicle-task-1',
        startedAt: '2026-11-01T18:30:00.000Z',
        endedAt: '2026-11-01T19:00:00.000Z',
        durationSeconds: 1200, // 20m active work during 30m span -> 10m paused
        note: 'Sprint retrospective with pauses',
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

    expect(wrapper.text()).toContain('20m')
    expect(wrapper.text()).toContain('(10m paused)')
  })

  it('preserves existing duration when editing timestamps of a paused session', async () => {
    const entries: TaskTimeEntryDto[] = [
      {
        id: 'entry-paused-edit',
        taskId: 'chronicle-task-1',
        startedAt: '2026-11-01T18:30:00.000Z',
        endedAt: '2026-11-01T19:00:00.000Z',
        durationSeconds: 1200, // 20m active
        note: 'Coding session',
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

    const editBtn = wrapper.find('[data-testid="btn-edit-session-entry-paused-edit"]')
    await editBtn.trigger('click')

    // Modify end time to 19:15 (span expands to 45m, duration should remain 20m)
    const endTimeInput = wrapper.find('[data-testid="edit-session-end-time"]')
    await endTimeInput.setValue('19:15')

    const saveBtn = wrapper.find('[data-testid="btn-save-session-edits"]')
    await saveBtn.trigger('click')

    const updated = wrapper.emitted('update:timeEntries')!.at(-1)![0] as TaskTimeEntryDto[]
    expect(updated[0].durationSeconds).toBe(1200) // Preserved!
  })

  it('renders contributor avatar with initials and tooltip on a shared board', () => {
    const entries: TaskTimeEntryDto[] = [
      {
        id: 'entry-collab-1',
        taskId: 'chronicle-task-1',
        startedAt: '2026-11-01T10:00:00.000Z',
        endedAt: '2026-11-01T10:30:00.000Z',
        durationSeconds: 1800,
        note: 'Collaboration session',
        user: {
          id: 42,
          display_name: 'Sarah Connor',
          email: 'sarah@example.com',
          timezone: 'UTC',
          created_at: '2026-01-01T00:00:00Z',
        },
      },
    ]

    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 'chronicle-task-1',
        timer: defaultTimer,
        timeEntries: entries,
        isShared: true,
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    const avatar = wrapper.find('[data-testid="time-entry-avatar-entry-collab-1"]')
    expect(avatar.exists()).toBe(true)
    expect(avatar.text()).toBe('SC')
    expect(avatar.attributes('title')).toBe('Sarah Connor <sarah@example.com>')
  })

  it('renders fallback avatar with user icon and Unknown user tooltip when user data is missing on a shared board', () => {
    const entries: TaskTimeEntryDto[] = [
      {
        id: 'entry-collab-anonymous',
        taskId: 'chronicle-task-1',
        startedAt: '2026-11-01T10:00:00.000Z',
        endedAt: '2026-11-01T10:30:00.000Z',
        durationSeconds: 1800,
        note: 'Anonymous session',
        user: null,
      },
    ]

    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 'chronicle-task-1',
        timer: defaultTimer,
        timeEntries: entries,
        isShared: true,
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    const avatar = wrapper.find('[data-testid="time-entry-avatar-entry-collab-anonymous"]')
    expect(avatar.exists()).toBe(true)
    expect(avatar.attributes('title')).toBe('Unknown user')
    expect(avatar.find('.pi-user').exists()).toBe(true)
  })

  it('omits contributor avatars completely on an unshared/solo board', () => {
    const entries: TaskTimeEntryDto[] = [
      {
        id: 'entry-solo-1',
        taskId: 'chronicle-task-1',
        startedAt: '2026-11-01T10:00:00.000Z',
        endedAt: '2026-11-01T10:30:00.000Z',
        durationSeconds: 1800,
        note: 'Solo session',
        user: {
          id: 1,
          display_name: 'Solo User',
          email: 'solo@example.com',
          timezone: 'UTC',
          created_at: '2026-01-01T00:00:00Z',
        },
      },
    ]

    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 'chronicle-task-1',
        timer: defaultTimer,
        timeEntries: entries,
        isShared: false,
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    const avatar = wrapper.find('[data-testid="time-entry-avatar-entry-solo-1"]')
    expect(avatar.exists()).toBe(false)
  })

  it('displays Recorded by dropdown defaulting to current user and records manual entry with selected contributor on a shared board', async () => {
    const member1 = {
      id: 10,
      display_name: 'Alice Cooper',
      email: 'alice@example.com',
      timezone: 'UTC',
      created_at: '2026-01-01T00:00:00Z',
    }
    const member2 = {
      id: 20,
      display_name: 'Bob Dylan',
      email: 'bob@example.com',
      timezone: 'UTC',
      created_at: '2026-01-01T00:00:00Z',
    }

    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 'chronicle-task-1',
        timer: defaultTimer,
        timeEntries: [],
        isShared: true,
        boardMembers: [member1, member2],
        currentUserId: member2.id,
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    // Toggle manual log form open
    const toggleBtn = wrapper.find('[data-testid="btn-toggle-log-past-work"]')
    await toggleBtn.trigger('click')

    // Dropdown is present
    const select = wrapper.find('[data-testid="manual-select-recorded-by"]')
    expect(select.exists()).toBe(true)

    // Option listing includes members
    expect(wrapper.text()).toContain('Bob Dylan')

    // Save manual session
    const noteInput = wrapper.find('[data-testid="manual-input-note"]')
    await noteInput.setValue('Pair programming with Bob')

    const saveBtn = wrapper.find('[data-testid="manual-save-btn"]')
    await saveBtn.trigger('click')

    expect(wrapper.emitted('update:timeEntries')).toBeTruthy()
    const updated = wrapper.emitted('update:timeEntries')!.at(-1)![0] as TaskTimeEntryDto[]
    expect(updated.length).toBe(1)
    expect(updated[0].userId).toBe(member2.id)
    expect(updated[0].user?.id).toBe(member2.id)
    expect(updated[0].note).toBe('Pair programming with Bob')
  })

  it('omits Recorded by dropdown in manual log form on a private/solo board', async () => {
    const wrapper = mount(TaskTimerEditor, {
      props: {
        taskId: 'chronicle-task-1',
        timer: defaultTimer,
        timeEntries: [],
        isShared: false,
        boardMembers: [{
          id: 1,
          display_name: 'Solo User',
          email: 'solo@example.com',
          timezone: 'UTC',
          created_at: '2026-01-01T00:00:00Z',
        }],
      },
      global: {
        plugins: [PrimeVue],
      },
    })

    const toggleBtn = wrapper.find('[data-testid="btn-toggle-log-past-work"]')
    await toggleBtn.trigger('click')

    expect(wrapper.find('[data-testid="manual-work-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="manual-select-recorded-by"]').exists()).toBe(false)
  })
})
