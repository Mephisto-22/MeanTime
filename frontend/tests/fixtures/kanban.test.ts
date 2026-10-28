import { describe, expect, it } from 'vitest'
import {
  createBoardFixture,
  createColumnFixture,
  createTaskFixture,
} from './kanban'

describe('Domain Fixture Factories', () => {
  describe('createTaskFixture', () => {
    it('creates a task with valid default title, position, and id', () => {
      const task = createTaskFixture()
      expect(task.id).toBeDefined()
      expect(task.title).toBeTruthy()
      expect(typeof task.position).toBe('number')
      expect(task.position).toBeGreaterThanOrEqual(0)
      expect(task.columnId).toBeDefined()
    })

    it('allows overriding task fields', () => {
      const task = createTaskFixture({
        id: 'custom-task-1',
        title: 'Custom Title',
        position: 3,
        description: 'Custom description',
        columnId: 'custom-col-1',
      })
      expect(task.id).toBe('custom-task-1')
      expect(task.title).toBe('Custom Title')
      expect(task.position).toBe(3)
      expect(task.description).toBe('Custom description')
      expect(task.columnId).toBe('custom-col-1')
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
