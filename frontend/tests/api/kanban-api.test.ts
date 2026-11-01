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

    // 12. moveTask
    await kanbanApi.moveTask(505, { to_column_id: 102, target_position: 1 })
    expect(postSpy).toHaveBeenLastCalledWith('/api/kanban/tasks/505/move', { to_column_id: 102, target_position: 1 })
  })

  it('routes Tag methods to correct paths, verbs, and payloads', async () => {
    const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue({} as any)
    const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue({} as any)

    // 13. listTags
    await kanbanApi.listTags()
    expect(getSpy).toHaveBeenLastCalledWith('/api/kanban/tags')

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
    await kanbanApi.moveTask(1, { to_column_id: 2, target_position: 0 })
    const moveCall = fetchCalls[fetchCalls.length - 1]
    expect(moveCall.options.method).toBe('POST')
    expect(moveCall.options.headers.Authorization).toBe('Bearer valid-bearer-token')
    expect(moveCall.options.headers['Content-Type']).toBe('application/json')
    expect(moveCall.options.body).toEqual({ to_column_id: 2, target_position: 0 })

    // TAG LIST (GET)
    await kanbanApi.listTags()
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
})
