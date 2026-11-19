import { describe, expect, it } from 'vitest'
import {
  createBoardFixture,
  createColumnFixture,
  createTagFixture,
  createTaskFeedItemFixture,
  createTaskFixture,
} from './kanban'

describe('Domain Fixture Factories', () => {
  describe('createTagFixture', () => {
    it('creates a tag with default id and name', () => {
      const tag = createTagFixture()
      expect(tag.id).toBeDefined()
      expect(tag.name).toBeTruthy()
    })

    it('allows overriding tag fields', () => {
      const tag = createTagFixture({
        id: 'tag-custom',
        name: 'Urgent',
        createdAt: '2026-10-27T00:00:00Z',
      })
      expect(tag.id).toBe('tag-custom')
      expect(tag.name).toBe('Urgent')
      expect(tag.createdAt).toBe('2026-10-27T00:00:00Z')
    })
  })

  describe('createTaskFixture', () => {
    it('creates a task with valid default title, position, and id', () => {
      const task = createTaskFixture()
      expect(task.id).toBeDefined()
      expect(task.title).toBeTruthy()
      expect(typeof task.position).toBe('number')
      expect(task.position).toBeGreaterThanOrEqual(0)
      expect(task.columnId).toBeDefined()
    })

    it('allows overriding task fields including priority and tags', () => {
      const tag = createTagFixture({ id: 'tag-1', name: 'Design' })
      const task = createTaskFixture({
        id: 'custom-task-1',
        title: 'Custom Title',
        position: 3,
        description: 'Custom description',
        columnId: 'custom-col-1',
        priority: 'HIGH',
        tags: [tag],
      })
      expect(task.id).toBe('custom-task-1')
      expect(task.title).toBe('Custom Title')
      expect(task.position).toBe(3)
      expect(task.description).toBe('Custom description')
      expect(task.columnId).toBe('custom-col-1')
      expect(task.priority).toBe('HIGH')
      expect(task.tags).toEqual([tag])
    })
  })

  describe('createTaskFeedItemFixture', () => {
    it('creates a Task Feed task with board and column metadata defaults', () => {
      const feedTask = createTaskFeedItemFixture()
      expect(feedTask.id).toBeDefined()
      expect(feedTask.title).toBeTruthy()
      expect(feedTask.columnId).toBeDefined()
      expect(feedTask.boardId).toBeDefined()
      expect(feedTask.boardTitle).toBeTruthy()
      expect(feedTask.columnTitle).toBeTruthy()
      expect(feedTask.updatedAt).toBeTruthy()
    })

    it('allows overriding Task Feed metadata alongside task fields', () => {
      const feedTask = createTaskFeedItemFixture({
        id: 42,
        title: 'Cross-board task',
        boardId: 7,
        boardTitle: 'Roadmap',
        columnId: 19,
        columnTitle: 'Review',
        totalSeconds: 900,
        updatedAt: '2026-11-18T12:00:00Z',
      })
      expect(feedTask.id).toBe(42)
      expect(feedTask.title).toBe('Cross-board task')
      expect(feedTask.boardId).toBe(7)
      expect(feedTask.boardTitle).toBe('Roadmap')
      expect(feedTask.columnId).toBe(19)
      expect(feedTask.columnTitle).toBe('Review')
      expect(feedTask.totalSeconds).toBe(900)
      expect(feedTask.updatedAt).toBe('2026-11-18T12:00:00Z')
    })
  })

  describe('createColumnFixture', () => {
    it('creates a column with default title, position, and empty tasks array', () => {
      const column = createColumnFixture()
      expect(column.id).toBeDefined()
      expect(column.title).toBeTruthy()
      expect(typeof column.position).toBe('number')
      expect(column.position).toBeGreaterThanOrEqual(0)
      expect(column.boardId).toBeDefined()
      expect(Array.isArray(column.tasks)).toBe(true)
    })

    it('allows overriding column fields including tasks', () => {
      const task = createTaskFixture({ id: 'task-10' })
      const column = createColumnFixture({
        id: 'col-99',
        title: 'Testing Column',
        position: 1,
        boardId: 'board-99',
        tasks: [task],
      })
      expect(column.id).toBe('col-99')
      expect(column.title).toBe('Testing Column')
      expect(column.position).toBe(1)
      expect(column.tasks).toHaveLength(1)
      expect(column.tasks[0].id).toBe('task-10')
    })
  })

  describe('createBoardFixture', () => {
    it('creates a board with default title and columns', () => {
      const board = createBoardFixture()
      expect(board.id).toBeDefined()
      expect(board.title).toBeTruthy()
      expect(Array.isArray(board.columns)).toBe(true)
    })

    it('allows overriding board fields and customizing nested columns', () => {
      const column = createColumnFixture({ id: 'col-1', title: 'To Do', position: 0 })
      const board = createBoardFixture({
        id: 'board-custom',
        title: 'My Custom Board',
        description: 'Test board description',
        columns: [column],
      })
      expect(board.id).toBe('board-custom')
      expect(board.title).toBe('My Custom Board')
      expect(board.description).toBe('Test board description')
      expect(board.columns).toHaveLength(1)
      expect(board.columns[0].title).toBe('To Do')
    })
  })
})
