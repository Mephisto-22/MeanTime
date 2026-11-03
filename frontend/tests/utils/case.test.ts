import { describe, expect, it } from 'vitest'
import {
  camelToSnake,
  deepTransformKeys,
  snakeToCamel,
  toCamelCase,
  toSnakeCase,
} from '~/utils/case'

describe('case conversion utilities (frontend/app/utils/case.ts)', () => {
  describe('snakeToCamel', () => {
    it('converts single and multi-word snake_case to camelCase', () => {
      expect(snakeToCamel('task_id')).toBe('taskId')
      expect(snakeToCamel('target_duration_seconds')).toBe('targetDurationSeconds')
      expect(snakeToCamel('column_id')).toBe('columnId')
      expect(snakeToCamel('time_entries')).toBe('timeEntries')
      expect(snakeToCamel('to_column_id')).toBe('toColumnId')
      expect(snakeToCamel('target_position')).toBe('targetPosition')
    })

    it('leaves single words and already-camelCase strings intact', () => {
      expect(snakeToCamel('id')).toBe('id')
      expect(snakeToCamel('taskId')).toBe('taskId')
      expect(snakeToCamel('targetDurationSeconds')).toBe('targetDurationSeconds')
    })

    it('preserves leading underscores', () => {
      expect(snakeToCamel('_id')).toBe('_id')
      expect(snakeToCamel('__metadata')).toBe('__metadata')
    })

    it('handles alphanumeric segments correctly', () => {
      expect(snakeToCamel('step_1_result')).toBe('step1Result')
    })
  })

  describe('camelToSnake', () => {
    it('converts single and multi-word camelCase to snake_case', () => {
      expect(camelToSnake('taskId')).toBe('task_id')
      expect(camelToSnake('targetDurationSeconds')).toBe('target_duration_seconds')
      expect(camelToSnake('columnId')).toBe('column_id')
      expect(camelToSnake('timeEntries')).toBe('time_entries')
      expect(camelToSnake('toColumnId')).toBe('to_column_id')
      expect(camelToSnake('targetPosition')).toBe('target_position')
    })

    it('leaves single lowercase words and already-snake_case strings intact', () => {
      expect(camelToSnake('id')).toBe('id')
      expect(camelToSnake('task_id')).toBe('task_id')
      expect(camelToSnake('target_duration_seconds')).toBe('target_duration_seconds')
    })

    it('handles numbers in camelCase identifiers', () => {
      expect(camelToSnake('step1Result')).toBe('step1_result')
    })
  })

  describe('deepTransformKeys (toCamelCase and toSnakeCase)', () => {
    it('recursively converts nested objects and arrays from snake_case to camelCase', () => {
      const input = {
        board_id: 1,
        board_title: 'Sprint 1',
        columns: [
          {
            column_id: 10,
            column_title: 'In Progress',
            tasks: [
              {
                task_id: 101,
                priority: 'HIGH',
                timer: {
                  mode: 'COUNT_DOWN',
                  target_duration_seconds: 1500,
                  started_at: '2026-11-02T10:00:00Z',
                  elapsed_seconds: 120,
                },
                time_entries: [
                  {
                    id: 5,
                    duration_seconds: 300,
                    note: 'note_with_underscores',
                  },
                ],
              },
            ],
          },
        ],
      }

      const transformed = toCamelCase(input)

      expect(transformed).toEqual({
        boardId: 1,
        boardTitle: 'Sprint 1',
        columns: [
          {
            columnId: 10,
            columnTitle: 'In Progress',
            tasks: [
              {
                taskId: 101,
                priority: 'HIGH', // Values are NOT transformed
                timer: {
                  mode: 'COUNT_DOWN', // Values are NOT transformed
                  targetDurationSeconds: 1500,
                  startedAt: '2026-11-02T10:00:00Z',
                  elapsedSeconds: 120,
                },
                timeEntries: [
                  {
                    id: 5,
                    durationSeconds: 300,
                    note: 'note_with_underscores', // Value with underscore untouched
                  },
                ],
              },
            ],
          },
        ],
      })
    })

    it('recursively converts nested objects and arrays from camelCase to snake_case', () => {
      const payload = {
        taskId: 101,
        columnId: 10,
        timer: {
          targetDurationSeconds: 1500,
          startedAt: '2026-11-02T10:00:00Z',
          elapsedSeconds: 0,
        },
        tagIds: [1, 2, 3],
      }

      const transformed = toSnakeCase(payload)

      expect(transformed).toEqual({
        task_id: 101,
        column_id: 10,
        timer: {
          target_duration_seconds: 1500,
          started_at: '2026-11-02T10:00:00Z',
          elapsed_seconds: 0,
        },
        tag_ids: [1, 2, 3],
      })
    })

    it('safely passes through null, undefined, primitives, Dates, and non-plain objects', () => {
      const now = new Date()
      expect(toCamelCase(null)).toBeNull()
      expect(toCamelCase(undefined)).toBeUndefined()
      expect(toCamelCase(42)).toBe(42)
      expect(toCamelCase('text_value')).toBe('text_value')
      expect(toCamelCase(now)).toBe(now)

      const mixed = {
        created_at: now,
        empty_val: null,
        is_active: true,
        count: 0,
      }
      const result = toCamelCase(mixed)
      expect(result.createdAt).toBe(now)
      expect(result.emptyVal).toBeNull()
      expect(result.isActive).toBe(true)
      expect(result.count).toBe(0)
    })
  })
})
