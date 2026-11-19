import { computed, ref, watch, type Ref } from 'vue'
import type { TagDto, TaskFeedItemDto } from '~/api/kanban'
import { TASK_PRIORITY_CONFIG } from '~/api/kanban'

export type TaskFeedPriorityFilter = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
export type TaskFeedSortKey = 'RECENT' | 'DUE_DATE' | 'PRIORITY' | 'TITLE'
export type TaskFeedSortDirection = 'asc' | 'desc'

export interface TaskFeedTagFilterOption {
  value: string
  label: string
  isUntagged: boolean
  count: number
}

export interface TaskFeedFilterState {
  searchQuery: string
  selectedPriorities: TaskFeedPriorityFilter[]
  selectedTags: string[]
}

export const TASK_FEED_UNTAGGED_VALUE = 'UNTAGGED'

export const TASK_FEED_PRIORITY_FILTER_OPTIONS: Array<{
  value: TaskFeedPriorityFilter
  label: string
  dotClass: string
}> = [
  { value: 'HIGH', label: TASK_PRIORITY_CONFIG.HIGH.label, dotClass: TASK_PRIORITY_CONFIG.HIGH.dotClass },
  { value: 'MEDIUM', label: TASK_PRIORITY_CONFIG.MEDIUM.label, dotClass: TASK_PRIORITY_CONFIG.MEDIUM.dotClass },
  { value: 'LOW', label: TASK_PRIORITY_CONFIG.LOW.label, dotClass: TASK_PRIORITY_CONFIG.LOW.dotClass },
  { value: 'NONE', label: 'No priority', dotClass: 'bg-surface-400' },
]

export const TASK_FEED_SORT_OPTIONS: Array<{
  value: TaskFeedSortKey
  label: string
  shortLabel: string
  defaultDirection: TaskFeedSortDirection
  icon: string
}> = [
  { value: 'RECENT', label: 'Most Recent', shortLabel: 'Recent', defaultDirection: 'desc', icon: 'pi pi-history' },
  { value: 'DUE_DATE', label: 'Due Date', shortLabel: 'Due', defaultDirection: 'asc', icon: 'pi pi-calendar' },
  { value: 'PRIORITY', label: 'Priority', shortLabel: 'Priority', defaultDirection: 'desc', icon: 'pi pi-flag' },
  { value: 'TITLE', label: 'Title', shortLabel: 'Title', defaultDirection: 'asc', icon: 'pi pi-sort-alpha-down' },
]

/** Return the natural default sort direction for a given Task Feed sort key. */
export function getDefaultSortDirection(sortBy: TaskFeedSortKey): TaskFeedSortDirection {
  return TASK_FEED_SORT_OPTIONS.find(opt => opt.value === sortBy)?.defaultDirection ?? 'desc'
}

/** Build deduplicated, alphabetically sorted Tag filter options plus trailing Untagged option. */
export function buildTaskFeedTagOptions(
  tasks: TaskFeedItemDto[],
  userTags: TagDto[],
): TaskFeedTagFilterOption[] {
  const countsByLower = new Map<string, { label: string; count: number }>()

  for (const tag of userTags) {
    const key = tag.name.toLowerCase()
    if (!countsByLower.has(key)) {
      countsByLower.set(key, { label: tag.name, count: 0 })
    }
  }

  let untaggedCount = 0
  for (const task of tasks) {
    const taskTags = task.tags ?? []
    if (taskTags.length === 0) {
      untaggedCount++
      continue
    }

    const seenOnTask = new Set<string>()
    for (const tag of taskTags) {
      const key = tag.name.toLowerCase()
      if (seenOnTask.has(key)) continue
      seenOnTask.add(key)

      const existing = countsByLower.get(key)
      if (existing) {
        existing.count++
      } else {
        countsByLower.set(key, { label: tag.name, count: 1 })
      }
    }
  }

  const options: TaskFeedTagFilterOption[] = Array.from(countsByLower.values())
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    .map(entry => ({
      value: entry.label,
      label: entry.label,
      isUntagged: false,
      count: entry.count,
    }))

  options.push({
    value: TASK_FEED_UNTAGGED_VALUE,
    label: 'Untagged',
    isUntagged: true,
    count: untaggedCount,
  })

  return options
}

/** Filter Task Feed tasks by Title search, Priority (OR), and Tag (OR) combined with AND. */
export function filterTaskFeedTasks(
  tasks: TaskFeedItemDto[],
  filters: TaskFeedFilterState,
): TaskFeedItemDto[] {
  const query = filters.searchQuery.trim().toLowerCase()
  const prioritySet = new Set(filters.selectedPriorities)
  const includeUntagged = filters.selectedTags.includes(TASK_FEED_UNTAGGED_VALUE)
  const namedTagSet = new Set(
    filters.selectedTags
      .filter(tag => tag !== TASK_FEED_UNTAGGED_VALUE)
      .map(tag => tag.toLowerCase()),
  )
  const hasTagFilter = includeUntagged || namedTagSet.size > 0

  return tasks.filter((task) => {
    if (query && !task.title.toLowerCase().includes(query)) {
      return false
    }

    if (prioritySet.size > 0) {
      const taskPriority: TaskFeedPriorityFilter = task.priority ?? 'NONE'
      if (!prioritySet.has(taskPriority)) {
        return false
      }
    }

    if (hasTagFilter) {
      const taskTags = task.tags ?? []
      if (taskTags.length === 0) {
        if (!includeUntagged) return false
      } else {
        const hasMatchingTag = taskTags.some(tag => namedTagSet.has(tag.name.toLowerCase()))
        if (!hasMatchingTag) return false
      }
    }

    return true
  })
}

const PRIORITY_WEIGHT: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function compareUpdatedDescThenId(a: TaskFeedItemDto, b: TaskFeedItemDto): number {
  const timeDiff = parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt)
  return timeDiff !== 0 ? timeDiff : String(a.id).localeCompare(String(b.id))
}

function compareNullableNumbersNullsLast(
  valA: number | null,
  valB: number | null,
  sortDirection: TaskFeedSortDirection,
): number {
  if (valA == null && valB == null) return 0
  if (valA == null) return 1
  if (valB == null) return -1
  return sortDirection === 'asc' ? valA - valB : valB - valA
}

/** Sort Task Feed tasks by RECENT, DUE_DATE (NULLS LAST), PRIORITY (NULLS LAST), or TITLE. */
export function sortTaskFeedTasks(
  tasks: TaskFeedItemDto[],
  sortBy: TaskFeedSortKey,
  sortDirection: TaskFeedSortDirection,
): TaskFeedItemDto[] {
  const sortedTasks = [...tasks]

  sortedTasks.sort((a, b) => {
    if (sortBy === 'RECENT') {
      const timeA = parseTimestamp(a.updatedAt)
      const timeB = parseTimestamp(b.updatedAt)
      const diff = sortDirection === 'asc' ? timeA - timeB : timeB - timeA
      return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id))
    }

    if (sortBy === 'DUE_DATE') {
      const parsedA = a.dueAt ? Date.parse(a.dueAt) : Number.NaN
      const parsedB = b.dueAt ? Date.parse(b.dueAt) : Number.NaN
      const dueA = Number.isNaN(parsedA) ? null : parsedA
      const dueB = Number.isNaN(parsedB) ? null : parsedB
      const diff = compareNullableNumbersNullsLast(dueA, dueB, sortDirection)
      return diff !== 0 ? diff : compareUpdatedDescThenId(a, b)
    }

    if (sortBy === 'PRIORITY') {
      const weightA = a.priority ? (PRIORITY_WEIGHT[a.priority] ?? null) : null
      const weightB = b.priority ? (PRIORITY_WEIGHT[b.priority] ?? null) : null
      const diff = compareNullableNumbersNullsLast(weightA, weightB, sortDirection)
      return diff !== 0 ? diff : compareUpdatedDescThenId(a, b)
    }

    const titleCompare = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    const dirCompare = sortDirection === 'asc' ? titleCompare : -titleCompare
    return dirCompare !== 0 ? dirCompare : compareUpdatedDescThenId(a, b)
  })

  return sortedTasks
}

/** Manage reactive search, multi-select filtering, and sorting state for the Task Feed. */
export function useTaskFeedFilters(
  tasks: Ref<TaskFeedItemDto[]> | Readonly<Ref<TaskFeedItemDto[]>>,
  userTags: Ref<TagDto[]> | Readonly<Ref<TagDto[]>>,
) {
  const searchQuery = ref('')
  const selectedPriorities = ref<TaskFeedPriorityFilter[]>([])
  const selectedTags = ref<string[]>([])
  const sortBy = ref<TaskFeedSortKey>('RECENT')
  const sortDirection = ref<TaskFeedSortDirection>('desc')

  watch(sortBy, (next) => {
    sortDirection.value = getDefaultSortDirection(next)
  })

  const availableTagOptions = computed(() =>
    buildTaskFeedTagOptions(tasks.value, userTags.value),
  )

  const filteredTasks = computed(() =>
    filterTaskFeedTasks(tasks.value, {
      searchQuery: searchQuery.value,
      selectedPriorities: selectedPriorities.value,
      selectedTags: selectedTags.value,
    }),
  )

  const visibleTasks = computed(() =>
    sortTaskFeedTasks(filteredTasks.value, sortBy.value, sortDirection.value),
  )

  const activeFilterCount = computed(() =>
    (searchQuery.value.trim() ? 1 : 0)
    + selectedPriorities.value.length
    + selectedTags.value.length,
  )

  const hasActiveFilters = computed(() => activeFilterCount.value > 0)

  const emptyText = computed(() =>
    tasks.value.length === 0
      ? 'No active tasks across your boards yet'
      : 'No tasks match your current filters',
  )

  const togglePriorityFilter = (value: TaskFeedPriorityFilter): void => {
    const exists = selectedPriorities.value.includes(value)
    selectedPriorities.value = exists
      ? selectedPriorities.value.filter(priority => priority !== value)
      : [...selectedPriorities.value, value]
  }

  const toggleTagFilter = (value: string): void => {
    const isUntagged = value === TASK_FEED_UNTAGGED_VALUE
    const targetLower = value.toLowerCase()
    const exists = isUntagged
      ? selectedTags.value.includes(TASK_FEED_UNTAGGED_VALUE)
      : selectedTags.value.some(tag => tag !== TASK_FEED_UNTAGGED_VALUE && tag.toLowerCase() === targetLower)

    selectedTags.value = exists
      ? selectedTags.value.filter(tag => (
          isUntagged
            ? tag !== TASK_FEED_UNTAGGED_VALUE
            : tag === TASK_FEED_UNTAGGED_VALUE || tag.toLowerCase() !== targetLower
        ))
      : [...selectedTags.value, value]
  }

  const toggleSortDirection = (): void => {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  }

  const resetFilters = (): void => {
    searchQuery.value = ''
    selectedPriorities.value = []
    selectedTags.value = []
  }

  return {
    searchQuery,
    selectedPriorities,
    selectedTags,
    sortBy,
    sortDirection,
    availableTagOptions,
    filteredTasks,
    visibleTasks,
    activeFilterCount,
    hasActiveFilters,
    emptyText,
    togglePriorityFilter,
    toggleTagFilter,
    toggleSortDirection,
    resetFilters,
  }
}
