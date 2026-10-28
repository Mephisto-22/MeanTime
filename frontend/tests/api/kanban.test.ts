import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  kanbanApi,
  type KanbanTaskDto,
  type TagDto,
  type TaskDialogSavePayload,
  type TaskPriorityType,
} from '~/api/kanban'
import { ApiError, apiService } from '~/services/ApiService'
import { createTagFixture, createTaskFixture } from '../fixtures/kanban'

const mockFetch = vi.fn()

vi.mock('#build/fetch.mjs', () => ({
  $fetch: (...args: any[]) => mockFetch(...args),
}))

describe('KanbanApi Tag & Priority Suite (frontend/tests/api/kanban.test.ts)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.restoreAllMocks()
  })

  describe('DTO & Type Definitions', () => {
    it('supports TaskPriorityType and TagDto shapes on KanbanTaskDto', () => {
      const tag = createTagFixture({
        id: 1,
        name: 'Urgent',
        created_at: '2026-10-27T20:00:00Z',
      })

      const priorityHigh: TaskPriorityType = 'HIGH'
      const priorityNull: TaskPriorityType = null

      const task = createTaskFixture({
        id: 'task-1',
        title: 'Task 1',
        position: 0,
        columnId: 'col-1',
        priority: priorityHigh,
        tags: [tag],
      })

      expect(task.priority).toBe('HIGH')
      expect(task.tags).toHaveLength(1)
      expect(task.tags?.[0].name).toBe('Urgent')

      const unassignedTask = createTaskFixture({
        id: 'task-2',
        title: 'Task 2',
        position: 1,
        columnId: 'col-1',
        priority: priorityNull,
      })
      expect(unassignedTask.priority).toBeNull()
      expect(unassignedTask.tags).toBeUndefined()
    })

    it('supports priority, tags, and tag_ids on TaskDialogSavePayload', () => {
      const tag = createTagFixture({ id: 'tag-1', name: 'Frontend' })
      const payload: TaskDialogSavePayload = {
        title: 'Updated Task',
        description: 'Detailed description',
        mode: 'edit',
        columnId: 2,
        taskId: 10,
        priority: 'MEDIUM',
        tags: [tag],
        tag_ids: [tag.id],
      }

      expect(payload.priority).toBe('MEDIUM')
      expect(payload.tags).toEqual([tag])
      expect(payload.tag_ids).toEqual(['tag-1'])
    })
  })

  describe('listTags endpoint', () => {
    it('routes listTags to GET /api/kanban/tags and returns TagDto array', async () => {
      const mockTags: TagDto[] = [
        createTagFixture({ id: 1, name: 'Backend', created_at: '2026-10-27T10:00:00Z' }),
        createTagFixture({ id: 2, name: 'Frontend', created_at: '2026-10-27T11:00:00Z' }),
      ]
      const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue(mockTags)

      const result = await kanbanApi.listTags()

      expect(getSpy).toHaveBeenCalledWith('/api/kanban/tags')
      expect(result).toEqual(mockTags)
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Backend')
    })

    it('propagates error when listTags fails', async () => {
      vi.spyOn(apiService, 'get').mockRejectedValue(new ApiError('Failed to fetch tags', 500))

      await expect(kanbanApi.listTags()).rejects.toThrow('Failed to fetch tags')
    })

    it('deserializes GET /api/kanban/tags response through ApiService with auth headers', async () => {
      const sampleTags: TagDto[] = [
        createTagFixture({ id: 101, name: 'DevOps', created_at: '2026-10-27T12:00:00Z' }),
      ]

      mockFetch.mockResolvedValueOnce(sampleTags)

      apiService.setAuthHandler({
        getAccessToken: () => 'valid-access-token',
        async refresh() {},
        async expireSession() {},
      })

      const tags = await kanbanApi.listTags()

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/kanban/tags',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-access-token',
            'Content-Type': 'application/json',
          }),
        }),
      )
      expect(tags).toEqual(sampleTags)
    })
  })

  describe('createTag endpoint', () => {
    it('routes createTag to POST /api/kanban/tags with payload and returns created TagDto', async () => {
      const payload = { name: 'Bug Fix' }
      const mockCreatedTag: TagDto = createTagFixture({
        id: 3,
        name: 'Bug Fix',
        created_at: '2026-10-27T14:00:00Z',
      })
      const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue(mockCreatedTag)

      const result = await kanbanApi.createTag(payload)

      expect(postSpy).toHaveBeenCalledWith('/api/kanban/tags', payload)
      expect(result).toEqual(mockCreatedTag)
      expect(result.id).toBe(3)
      expect(result.name).toBe('Bug Fix')
    })

    it('propagates error response when createTag fails (e.g. 400 Bad Request)', async () => {
      vi.spyOn(apiService, 'post').mockRejectedValue(new ApiError('Tag name cannot be empty.', 400))

      await expect(kanbanApi.createTag({ name: '' })).rejects.toThrow('Tag name cannot be empty.')
    })

    it('deserializes POST /api/kanban/tags response through ApiService with payload and headers', async () => {
      const createdTag: TagDto = createTagFixture({
        id: 202,
        name: 'Design System',
        created_at: '2026-10-27T15:30:00Z',
      })

      mockFetch.mockResolvedValueOnce(createdTag)

      apiService.setAuthHandler({
        getAccessToken: () => 'auth-token-123',
        async refresh() {},
        async expireSession() {},
      })

      const result = await kanbanApi.createTag({ name: 'Design System' })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/kanban/tags',
        expect.objectContaining({
          method: 'POST',
          body: { name: 'Design System' },
          headers: expect.objectContaining({
            Authorization: 'Bearer auth-token-123',
            'Content-Type': 'application/json',
          }),
        }),
      )
      expect(result).toEqual(createdTag)
    })

    it('handles duplicate tag error (409 Conflict) through ApiService', async () => {
      mockFetch.mockRejectedValueOnce({
        statusCode: 409,
        data: { message: 'A tag with this name already exists.' },
      })

      apiService.setAuthHandler({
        getAccessToken: () => 'auth-token-123',
        async refresh() {},
        async expireSession() {},
      })

      await expect(kanbanApi.createTag({ name: 'Duplicate Tag' })).rejects.toMatchObject({
        name: 'ApiError',
        statusCode: 409,
        message: 'A tag with this name already exists.',
      })
    })
  })
})
