import { beforeEach, describe, expect, it, vi } from 'vitest'
import { kanbanApi } from '~/api/kanban'
import { apiService } from '~/services/ApiService'

const mockFetch = vi.fn()

vi.mock('#build/fetch.mjs', () => ({
  $fetch: (...args: any[]) => mockFetch(...args),
}))

describe('KanbanApi Contract Suite', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.restoreAllMocks()
  })

  it('routes all 5 Board CRUD methods to correct paths, verbs, and payloads', async () => {
    const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue({} as any)
    const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue({} as any)
    const patchSpy = vi.spyOn(apiService, 'patch').mockResolvedValue({} as any)
    const deleteSpy = vi.spyOn(apiService, 'delete').mockResolvedValue({} as any)

    // 1. listBoards
    await kanbanApi.listBoards()
    expect(getSpy).toHaveBeenLastCalledWith('/api/kanban/boards')

    // 2. getBoard
    await kanbanApi.getBoard(42)
    expect(getSpy).toHaveBeenLastCalledWith('/api/kanban/boards/42')

    // 3. createBoard
    await kanbanApi.createBoard({ title: 'New Board', description: 'Test Desc' })
    expect(postSpy).toHaveBeenLastCalledWith('/api/kanban/boards', { title: 'New Board', description: 'Test Desc' })

    // 4. updateBoard
    await kanbanApi.updateBoard(42, { title: 'Renamed Board' })
    expect(patchSpy).toHaveBeenLastCalledWith('/api/kanban/boards/42', { title: 'Renamed Board' })

    // 5. deleteBoard
    await kanbanApi.deleteBoard(42)
    expect(deleteSpy).toHaveBeenLastCalledWith('/api/kanban/boards/42')

    // 6. shareBoard
    await kanbanApi.shareBoard(42, 10)
    expect(postSpy).toHaveBeenLastCalledWith('/api/kanban/boards/42/collaborators', { friend_id: 10 })

    // 7. removeCollaborator
    await kanbanApi.removeCollaborator(42, 10)
    expect(deleteSpy).toHaveBeenLastCalledWith('/api/kanban/boards/42/collaborators/10')
  })

  it('routes all 3 Column CRUD methods to correct paths, verbs, and payloads', async () => {
    const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue({} as any)
    const patchSpy = vi.spyOn(apiService, 'patch').mockResolvedValue({} as any)
    const deleteSpy = vi.spyOn(apiService, 'delete').mockResolvedValue({} as any)

    // 6. createColumn
    await kanbanApi.createColumn(10, { title: 'Backlog', position: 0 })
    expect(postSpy).toHaveBeenLastCalledWith('/api/kanban/boards/10/columns', { title: 'Backlog', position: 0 })

    // 7. updateColumn
    await kanbanApi.updateColumn(101, { title: 'In Review', position: 2 })
    expect(patchSpy).toHaveBeenLastCalledWith('/api/kanban/columns/101', { title: 'In Review', position: 2 })

    // 8. deleteColumn
    await kanbanApi.deleteColumn(101)
    expect(deleteSpy).toHaveBeenLastCalledWith('/api/kanban/columns/101')
  })

  it('routes all 4 Task methods including move to correct paths, verbs, and payloads', async () => {
    const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue({} as any)
    const patchSpy = vi.spyOn(apiService, 'patch').mockResolvedValue({} as any)
    const deleteSpy = vi.spyOn(apiService, 'delete').mockResolvedValue({} as any)

    // 9. createTask
    await kanbanApi.createTask(101, { title: 'New Task', description: 'Details' })
    expect(postSpy).toHaveBeenLastCalledWith('/api/kanban/columns/101/tasks', { title: 'New Task', description: 'Details' })

    // 10. updateTask
    await kanbanApi.updateTask(505, { title: 'Updated Title', description: 'Updated Details' })
    expect(patchSpy).toHaveBeenLastCalledWith('/api/kanban/tasks/505', { title: 'Updated Title', description: 'Updated Details' })

    // 11. deleteTask
    await kanbanApi.deleteTask(505)
    expect(deleteSpy).toHaveBeenLastCalledWith('/api/kanban/tasks/505')

    // 11b. deleteTask with cancelRecurrence
    await kanbanApi.deleteTask(505, { cancelRecurrence: true })
    expect(deleteSpy).toHaveBeenLastCalledWith('/api/kanban/tasks/505', undefined, { query: { cancel_recurrence: true } })

    // 12. moveTask
    await kanbanApi.moveTask(505, { toColumnId: 102, targetPosition: 1 })
    expect(postSpy).toHaveBeenLastCalledWith('/api/kanban/tasks/505/move', { toColumnId: 102, targetPosition: 1 })
  })

  it('routes RecurringTask methods to correct paths, verbs, and payloads', async () => {
    const patchSpy = vi.spyOn(apiService, 'patch').mockResolvedValue({} as any)

    await kanbanApi.updateRecurringTask(42, { isActive: false })
    expect(patchSpy).toHaveBeenLastCalledWith('/api/kanban/recurring-tasks/42', { isActive: false })
  })

  it('routes Tag methods to correct paths, verbs, and payloads', async () => {
    const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue({} as any)
    const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue({} as any)

    // 13. listTags
    await kanbanApi.listTags(42)
    expect(getSpy).toHaveBeenLastCalledWith('/api/kanban/tags?board_id=42')

    // 14. createTag
    await kanbanApi.createTag({ name: 'Urgent' })
    expect(postSpy).toHaveBeenLastCalledWith('/api/kanban/tags', { name: 'Urgent' })
  })

  it('integrates with ApiService to dispatch bearer authorization and JSON headers across all verbs', async () => {
    const fetchCalls: Array<{ url: string; options: any }> = []
    mockFetch.mockImplementation(async (url: string, options: any) => {
      fetchCalls.push({ url, options })
      return { id: 1, ok: true }
    })

    apiService.setAuthHandler({
      getAccessToken: () => 'valid-bearer-token',
      async refresh() {},
      async expireSession() {},
    })

    // GET
    await kanbanApi.listBoards()
    const getCall = fetchCalls[fetchCalls.length - 1]
    expect(getCall.options.method).toBe('GET')
    expect(getCall.options.headers.Authorization).toBe('Bearer valid-bearer-token')
    expect(getCall.options.headers['Content-Type']).toBe('application/json')

    // POST
    await kanbanApi.createBoard({ title: 'New Board' })
    const postCall = fetchCalls[fetchCalls.length - 1]
    expect(postCall.options.method).toBe('POST')
    expect(postCall.options.headers.Authorization).toBe('Bearer valid-bearer-token')
    expect(postCall.options.headers['Content-Type']).toBe('application/json')
    expect(postCall.options.body).toEqual({ title: 'New Board' })

    // PATCH
    await kanbanApi.updateBoard(1, { title: 'Updated Board' })
    const patchCall = fetchCalls[fetchCalls.length - 1]
    expect(patchCall.options.method).toBe('PATCH')
    expect(patchCall.options.headers.Authorization).toBe('Bearer valid-bearer-token')
    expect(patchCall.options.headers['Content-Type']).toBe('application/json')
    expect(patchCall.options.body).toEqual({ title: 'Updated Board' })

    // DELETE
    await kanbanApi.deleteBoard(1)
    const deleteCall = fetchCalls[fetchCalls.length - 1]
    expect(deleteCall.options.method).toBe('DELETE')
    expect(deleteCall.options.headers.Authorization).toBe('Bearer valid-bearer-token')
    expect(deleteCall.options.headers['Content-Type']).toBe('application/json')

    // MOVE (POST)
    await kanbanApi.moveTask(1, { toColumnId: 2, targetPosition: 0 })
    const moveCall = fetchCalls[fetchCalls.length - 1]
    expect(moveCall.options.method).toBe('POST')
    expect(moveCall.options.headers.Authorization).toBe('Bearer valid-bearer-token')
    expect(moveCall.options.headers['Content-Type']).toBe('application/json')
    expect(moveCall.options.body).toEqual({ to_column_id: 2, target_position: 0 })

    // TAG LIST (GET)
    await kanbanApi.listTags(42)
    const tagListCall = fetchCalls[fetchCalls.length - 1]
    expect(tagListCall.options.method).toBe('GET')
    expect(tagListCall.options.headers.Authorization).toBe('Bearer valid-bearer-token')
    expect(tagListCall.options.headers['Content-Type']).toBe('application/json')

    // TAG CREATE (POST)
    await kanbanApi.createTag({ name: 'Important' })
    const tagCreateCall = fetchCalls[fetchCalls.length - 1]
    expect(tagCreateCall.options.method).toBe('POST')
    expect(tagCreateCall.options.headers.Authorization).toBe('Bearer valid-bearer-token')
    expect(tagCreateCall.options.headers['Content-Type']).toBe('application/json')
    expect(tagCreateCall.options.body).toEqual({ name: 'Important' })
  })

  it('fetches the cross-board Task Feed via GET /api/kanban/tasks and converts DTO fields to camelCase', async () => {
    mockFetch.mockResolvedValue([
      {
        id: 101,
        title: 'Audit API schema',
        description: 'Verify Task Feed payload',
        priority: 'HIGH',
        position: 0,
        column_id: 12,
        board_id: 3,
        board_title: 'Platform',
        column_title: 'In Progress',
        due_at: '2026-11-25T15:00:00Z',
        reminder_offset_seconds: 3600,
        total_seconds: 1800,
        created_at: '2026-11-18T10:00:00Z',
        updated_at: '2026-11-18T12:30:00Z',
        tags: [
          {
            id: 7,
            name: 'Backend',
            created_at: '2026-11-01T08:00:00Z',
          },
        ],
        timer: {
          id: 55,
          task_id: 101,
          mode: 'COUNT_DOWN',
          target_duration_seconds: 1500,
          state: 'PAUSED',
          started_at: '2026-11-18T12:00:00Z',
          last_resumed_at: null,
          last_paused_at: '2026-11-18T12:10:00Z',
          elapsed_seconds: 600,
        },
      },
    ])

    apiService.setAuthHandler({
      getAccessToken: () => 'valid-bearer-token',
      async refresh() {},
      async expireSession() {},
    })

    const tasks = await kanbanApi.listTaskFeed()

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/kanban/tasks',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-bearer-token',
        }),
      }),
    )

    expect(tasks).toEqual([
      {
        id: 101,
        title: 'Audit API schema',
        description: 'Verify Task Feed payload',
        priority: 'HIGH',
        position: 0,
        columnId: 12,
        boardId: 3,
        boardTitle: 'Platform',
        columnTitle: 'In Progress',
        dueAt: '2026-11-25T15:00:00Z',
        reminderOffsetSeconds: 3600,
        totalSeconds: 1800,
        createdAt: '2026-11-18T10:00:00Z',
        updatedAt: '2026-11-18T12:30:00Z',
        tags: [
          {
            id: 7,
            name: 'Backend',
            createdAt: '2026-11-01T08:00:00Z',
          },
        ],
        timer: {
          id: 55,
          taskId: 101,
          mode: 'COUNT_DOWN',
          targetDurationSeconds: 1500,
          state: 'PAUSED',
          startedAt: '2026-11-18T12:00:00Z',
          lastResumedAt: null,
          lastPausedAt: '2026-11-18T12:10:00Z',
          elapsedSeconds: 600,
        },
      },
    ])
  })

  it('fetches the authenticated user tags via GET /api/kanban/tags without board_id and converts DTO fields to camelCase', async () => {
    mockFetch.mockResolvedValue([
      {
        id: 9,
        name: 'Deep Work',
        created_at: '2026-11-10T09:15:00Z',
      },
    ])

    apiService.setAuthHandler({
      getAccessToken: () => 'valid-bearer-token',
      async refresh() {},
      async expireSession() {},
    })

    const tags = await kanbanApi.listUserTags()

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/kanban/tags',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-bearer-token',
        }),
      }),
    )

    expect(tags).toEqual([
      {
        id: 9,
        name: 'Deep Work',
        createdAt: '2026-11-10T09:15:00Z',
      },
    ])
  })
})
