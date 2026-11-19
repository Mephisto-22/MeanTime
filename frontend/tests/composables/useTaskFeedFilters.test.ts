import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { TASK_PRIORITY_CONFIG, type TagDto, type TaskFeedItemDto } from '~/api/kanban'
import {
  buildTaskFeedTagOptions,
  filterTaskFeedTasks,
  getDefaultSortDirection,
  sortTaskFeedTasks,
  TASK_FEED_PRIORITY_FILTER_OPTIONS,
  TASK_FEED_SORT_OPTIONS,
  TASK_FEED_UNTAGGED_VALUE,
  useTaskFeedFilters,
} from '~/composables/useTaskFeedFilters'
import { createTagFixture, createTaskFeedItemFixture } from '../fixtures'

describe('useTaskFeedFilters', () => {
  describe('filter and sort constants and default directions', () => {
    it('exports expected priority filter options sourced from TASK_PRIORITY_CONFIG and sort options with default directions', () => {
      expect(TASK_FEED_UNTAGGED_VALUE).toBe('UNTAGGED')

      expect(TASK_FEED_PRIORITY_FILTER_OPTIONS).toEqual([
        {
          value: 'HIGH',
          label: TASK_PRIORITY_CONFIG.HIGH.label,
          dotClass: TASK_PRIORITY_CONFIG.HIGH.dotClass,
        },
        {
          value: 'MEDIUM',
          label: TASK_PRIORITY_CONFIG.MEDIUM.label,
          dotClass: TASK_PRIORITY_CONFIG.MEDIUM.dotClass,
        },
        {
          value: 'LOW',
          label: TASK_PRIORITY_CONFIG.LOW.label,
          dotClass: TASK_PRIORITY_CONFIG.LOW.dotClass,
        },
        {
          value: 'NONE',
          label: 'No priority',
          dotClass: 'bg-surface-400',
        },
      ])

      expect(TASK_FEED_SORT_OPTIONS).toEqual([
        { value: 'RECENT', label: 'Most Recent', shortLabel: 'Recent', defaultDirection: 'desc', icon: 'pi pi-history' },
        { value: 'DUE_DATE', label: 'Due Date', shortLabel: 'Due', defaultDirection: 'asc', icon: 'pi pi-calendar' },
        { value: 'PRIORITY', label: 'Priority', shortLabel: 'Priority', defaultDirection: 'desc', icon: 'pi pi-flag' },
        { value: 'TITLE', label: 'Title', shortLabel: 'Title', defaultDirection: 'asc', icon: 'pi pi-sort-alpha-down' },
      ])

      expect(getDefaultSortDirection('RECENT')).toBe('desc')
      expect(getDefaultSortDirection('DUE_DATE')).toBe('asc')
      expect(getDefaultSortDirection('PRIORITY')).toBe('desc')
      expect(getDefaultSortDirection('TITLE')).toBe('asc')
    })
  })

  describe('buildTaskFeedTagOptions', () => {
    it('case-insensitively deduplicates union of userTags and task tags, counts distinct tasks, sorts alphabetically, and appends Untagged', () => {
      const userTags = [
        createTagFixture({ id: 1, name: 'Urgent' }),
        createTagFixture({ id: 2, name: 'Backend' }),
        createTagFixture({ id: 3, name: 'UnusedTag' }),
        createTagFixture({ id: 4, name: 'backend' }),
      ]
      const tasks = [
        createTaskFeedItemFixture({
          id: 't1',
          boardId: 1,
          tags: [
            createTagFixture({ id: 10, name: 'urgent' }),
            createTagFixture({ id: 11, name: 'URGENT' }),
            createTagFixture({ id: 12, name: 'Alpha' }),
          ],
        }),
        createTaskFeedItemFixture({
          id: 't2',
          boardId: 2,
          tags: [
            createTagFixture({ id: 20, name: 'Urgent' }),
            createTagFixture({ id: 21, name: 'Backend' }),
          ],
        }),
        createTaskFeedItemFixture({
          id: 't3',
          boardId: 1,
          tags: [],
        }),
        createTaskFeedItemFixture({
          id: 't4',
          boardId: 2,
          tags: undefined,
        }),
      ]

      expect(buildTaskFeedTagOptions(tasks, userTags)).toEqual([
        { value: 'Alpha', label: 'Alpha', isUntagged: false, count: 1 },
        { value: 'Backend', label: 'Backend', isUntagged: false, count: 1 },
        { value: 'UnusedTag', label: 'UnusedTag', isUntagged: false, count: 0 },
        { value: 'Urgent', label: 'Urgent', isUntagged: false, count: 2 },
        { value: TASK_FEED_UNTAGGED_VALUE, label: 'Untagged', isUntagged: true, count: 2 },
      ])
    })

    it('appends Untagged with count 0 when tasks and userTags are empty', () => {
      expect(buildTaskFeedTagOptions([], [])).toEqual([
        { value: TASK_FEED_UNTAGGED_VALUE, label: 'Untagged', isUntagged: true, count: 0 },
      ])
    })
  })

  describe('filterTaskFeedTasks', () => {
    const sampleTasks = () => [
      createTaskFeedItemFixture({
        id: 'f1',
        title: 'Audit Redis pool',
        boardId: 1,
        priority: 'HIGH',
        tags: [createTagFixture({ id: 1, name: 'Backend' }), createTagFixture({ id: 2, name: 'Urgent' })],
      }),
      createTaskFeedItemFixture({
        id: 'f2',
        title: 'Review UI tokens',
        boardId: 2,
        priority: 'MEDIUM',
        tags: [createTagFixture({ id: 3, name: 'frontend' })],
      }),
      createTaskFeedItemFixture({
        id: 'f3',
        title: 'Patch redis timeout',
        boardId: 3,
        priority: null,
        tags: [],
      }),
      createTaskFeedItemFixture({
        id: 'f4',
        title: 'Verify SSL certs',
        boardId: 2,
        priority: 'LOW',
        tags: [createTagFixture({ id: 4, name: 'URGENT' })],
      }),
    ]

    it('filters by trimmed case-insensitive title search', () => {
      const tasks = sampleTasks()
      const result = filterTaskFeedTasks(tasks, {
        searchQuery: '  REDIS ',
        selectedPriorities: [],
        selectedTags: [],
      })
      expect(result.map(t => t.id)).toEqual(['f1', 'f3'])
      expect(
        filterTaskFeedTasks(tasks, {
          searchQuery: '   ',
          selectedPriorities: [],
          selectedTags: [],
        }).map(t => t.id),
      ).toEqual(['f1', 'f2', 'f3', 'f4'])
    })

    it('filters priorities with OR semantics including NONE for null or undefined priority', () => {
      const tasks = sampleTasks()
      const result = filterTaskFeedTasks(tasks, {
        searchQuery: '',
        selectedPriorities: ['HIGH', 'NONE'],
        selectedTags: [],
      })
      expect(result.map(t => t.id)).toEqual(['f1', 'f3'])
    })

    it('filters tags with OR semantics across boards case-insensitively including UNTAGGED', () => {
      const tasks = sampleTasks()
      const result = filterTaskFeedTasks(tasks, {
        searchQuery: '',
        selectedPriorities: [],
        selectedTags: ['urgent', TASK_FEED_UNTAGGED_VALUE],
      })
      expect(result.map(t => t.id)).toEqual(['f1', 'f3', 'f4'])
    })

    it('combines searchQuery, selectedPriorities, and selectedTags with AND semantics', () => {
      const tasks = sampleTasks()
      const result = filterTaskFeedTasks(tasks, {
        searchQuery: 'redis',
        selectedPriorities: ['HIGH', 'NONE'],
        selectedTags: ['Urgent'],
      })
      expect(result.map(t => t.id)).toEqual(['f1'])
    })
  })

  describe('sortTaskFeedTasks', () => {
    it('sorts by RECENT in asc/desc with id localeCompare tie-breaking without mutating input', () => {
      const tasks = [
        createTaskFeedItemFixture({ id: 'b', updatedAt: '2026-11-18T10:00:00Z' }),
        createTaskFeedItemFixture({ id: 'a', updatedAt: '2026-11-18T10:00:00Z' }),
        createTaskFeedItemFixture({ id: 'c', updatedAt: '2026-11-18T12:00:00Z' }),
      ]
      const originalOrder = tasks.map(t => t.id)

      expect(sortTaskFeedTasks(tasks, 'RECENT', 'desc').map(t => t.id)).toEqual(['c', 'a', 'b'])
      expect(sortTaskFeedTasks(tasks, 'RECENT', 'asc').map(t => t.id)).toEqual(['a', 'b', 'c'])
      expect(tasks.map(t => t.id)).toEqual(originalOrder)
    })

    it('sorts by DUE_DATE with NULLS LAST in both asc and desc and breaks ties by updatedAt desc then id', () => {
      const tasks = [
        createTaskFeedItemFixture({ id: 'null-old', dueAt: null, updatedAt: '2026-11-18T08:00:00Z' }),
        createTaskFeedItemFixture({ id: 'invalid-new', dueAt: 'not-a-date', updatedAt: '2026-11-18T09:00:00Z' }),
        createTaskFeedItemFixture({ id: 'due-late', dueAt: '2026-11-22T12:00:00Z', updatedAt: '2026-11-18T10:00:00Z' }),
        createTaskFeedItemFixture({ id: 'due-early-b', dueAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-18T10:00:00Z' }),
        createTaskFeedItemFixture({ id: 'due-early-a', dueAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-18T10:00:00Z' }),
        createTaskFeedItemFixture({ id: 'due-early-newer', dueAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-18T11:00:00Z' }),
      ]

      expect(sortTaskFeedTasks(tasks, 'DUE_DATE', 'asc').map(t => t.id)).toEqual([
        'due-early-newer',
        'due-early-a',
        'due-early-b',
        'due-late',
        'invalid-new',
        'null-old',
      ])

      expect(sortTaskFeedTasks(tasks, 'DUE_DATE', 'desc').map(t => t.id)).toEqual([
        'due-late',
        'due-early-newer',
        'due-early-a',
        'due-early-b',
        'invalid-new',
        'null-old',
      ])
    })

    it('sorts by PRIORITY with HIGH > MEDIUM > LOW and NULLS LAST in both asc and desc', () => {
      const tasks = [
        createTaskFeedItemFixture({ id: 'none-1', priority: null, updatedAt: '2026-11-18T08:00:00Z' }),
        createTaskFeedItemFixture({ id: 'low-1', priority: 'LOW', updatedAt: '2026-11-18T09:00:00Z' }),
        createTaskFeedItemFixture({ id: 'high-a', priority: 'HIGH', updatedAt: '2026-11-18T10:00:00Z' }),
        createTaskFeedItemFixture({ id: 'high-newer', priority: 'HIGH', updatedAt: '2026-11-18T11:00:00Z' }),
        createTaskFeedItemFixture({ id: 'med-1', priority: 'MEDIUM', updatedAt: '2026-11-18T12:00:00Z' }),
      ]

      expect(sortTaskFeedTasks(tasks, 'PRIORITY', 'desc').map(t => t.id)).toEqual([
        'high-newer',
        'high-a',
        'med-1',
        'low-1',
        'none-1',
      ])

      expect(sortTaskFeedTasks(tasks, 'PRIORITY', 'asc').map(t => t.id)).toEqual([
        'low-1',
        'med-1',
        'high-newer',
        'high-a',
        'none-1',
      ])
    })

    it('sorts by TITLE case-insensitively and breaks ties by updatedAt desc then id', () => {
      const tasks = [
        createTaskFeedItemFixture({ id: '2', title: 'beta', updatedAt: '2026-11-18T10:00:00Z' }),
        createTaskFeedItemFixture({ id: '1', title: 'Beta', updatedAt: '2026-11-18T10:00:00Z' }),
        createTaskFeedItemFixture({ id: '3', title: 'beta', updatedAt: '2026-11-18T12:00:00Z' }),
        createTaskFeedItemFixture({ id: '4', title: 'alpha', updatedAt: '2026-11-18T09:00:00Z' }),
      ]

      expect(sortTaskFeedTasks(tasks, 'TITLE', 'asc').map(t => t.id)).toEqual(['4', '3', '1', '2'])
      expect(sortTaskFeedTasks(tasks, 'TITLE', 'desc').map(t => t.id)).toEqual(['3', '1', '2', '4'])
    })
  })

  describe('useTaskFeedFilters composable', () => {
    it('manages ephemeral filter and sort state, auto-updates sortDirection on sortBy change, counts search in activeFilterCount, and resets filters', async () => {
      const tasks = ref<TaskFeedItemDto[]>([
        createTaskFeedItemFixture({
          id: 't1',
          title: 'Zebra migration',
          priority: 'LOW',
          dueAt: '2026-11-25T10:00:00Z',
          updatedAt: '2026-11-18T10:00:00Z',
          tags: [createTagFixture({ id: 1, name: 'Ops' })],
        }),
        createTaskFeedItemFixture({
          id: 't2',
          title: 'Alpha audit',
          priority: 'HIGH',
          dueAt: '2026-11-20T10:00:00Z',
          updatedAt: '2026-11-18T12:00:00Z',
          tags: [],
        }),
      ])
      const userTags = ref<TagDto[]>([
        createTagFixture({ id: 1, name: 'Ops' }),
        createTagFixture({ id: 2, name: 'Design' }),
      ])

      const state = useTaskFeedFilters(tasks, userTags)

      expect(state.searchQuery.value).toBe('')
      expect(state.selectedPriorities.value).toEqual([])
      expect(state.selectedTags.value).toEqual([])
      expect(state.sortBy.value).toBe('RECENT')
      expect(state.sortDirection.value).toBe('desc')
      expect(state.activeFilterCount.value).toBe(0)
      expect(state.hasActiveFilters.value).toBe(false)
      expect(state.emptyText.value).toBe('No tasks match your current filters')
      expect(state.visibleTasks.value.map(t => t.id)).toEqual(['t2', 't1'])
      expect(state.availableTagOptions.value.map(o => o.label)).toEqual(['Design', 'Ops', 'Untagged'])

      state.searchQuery.value = '  zebra '
      expect(state.activeFilterCount.value).toBe(1)
      expect(state.hasActiveFilters.value).toBe(true)
      expect(state.visibleTasks.value.map(t => t.id)).toEqual(['t1'])

      state.togglePriorityFilter('HIGH')
      expect(state.selectedPriorities.value).toEqual(['HIGH'])
      expect(state.activeFilterCount.value).toBe(2)
      expect(state.visibleTasks.value).toEqual([])
      expect(state.emptyText.value).toBe('No tasks match your current filters')

      state.togglePriorityFilter('HIGH')
      state.toggleTagFilter('Ops')
      expect(state.selectedPriorities.value).toEqual([])
      expect(state.selectedTags.value).toEqual(['Ops'])
      expect(state.activeFilterCount.value).toBe(2)
      expect(state.visibleTasks.value.map(t => t.id)).toEqual(['t1'])

      state.sortBy.value = 'DUE_DATE'
      await nextTick()
      expect(state.sortDirection.value).toBe('asc')

      state.toggleSortDirection()
      expect(state.sortDirection.value).toBe('desc')

      state.resetFilters()
      expect(state.searchQuery.value).toBe('')
      expect(state.selectedPriorities.value).toEqual([])
      expect(state.selectedTags.value).toEqual([])
      expect(state.activeFilterCount.value).toBe(0)
      expect(state.hasActiveFilters.value).toBe(false)
      expect(state.sortBy.value).toBe('DUE_DATE')
      expect(state.sortDirection.value).toBe('desc')
      expect(state.visibleTasks.value.map(t => t.id)).toEqual(['t1', 't2'])

      tasks.value = []
      expect(state.emptyText.value).toBe('No active tasks across your boards yet')
    })
  })
})
