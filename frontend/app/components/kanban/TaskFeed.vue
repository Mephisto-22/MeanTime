<template>
  <div
    v-if="loading && tasks.length === 0"
    data-testid="task-feed-loading"
    class="kanban-column"
  >
    <div class="flex items-center justify-between">
      <Skeleton width="6rem" height="1.25rem" />
      <Skeleton width="2rem" height="1.25rem" border-radius="9999px" />
    </div>
    <Skeleton
      v-for="n in 3"
      :key="n"
      height="7rem"
      border-radius="12px"
    />
  </div>

  <div
    v-else-if="error"
    data-testid="task-feed-error"
    class="error-state-card"
  >
    <div class="flex flex-wrap items-center gap-3">
      <span>We couldn't load your task feed.</span>
      <Button
        label="Try again"
        icon="pi pi-refresh"
        severity="danger"
        text
        size="small"
        @click="emit('retry')"
      />
    </div>
  </div>

  <template v-else>
    <KanbanColumn
      :column="feedColumn"
      :draggable="false"
      :show-edit-button="false"
      :show-add-task="false"
      :empty-text="resolvedEmptyText"
    >
      <template #header-actions>
        <slot name="header-actions">
          <Button
            type="button"
            data-testid="feed-filter-trigger"
            size="small"
            :severity="activeFilterCount > 0 ? 'primary' : 'secondary'"
            :variant="activeFilterCount > 0 ? undefined : 'outlined'"
            class="px-2 text-xs"
            aria-label="Filter tasks"
            @click="toggleFilterPopover"
          >
            <i class="pi pi-filter text-xs" aria-hidden="true" />
            <span class="hidden xl:inline">Filter</span>
            <Badge
              v-if="activeFilterCount > 0"
              data-testid="feed-filter-count-badge"
              :value="activeFilterCount"
              severity="contrast"
              size="small"
            />
          </Button>

          <InputGroup class="w-auto">
            <Select
              v-model="sortBy"
              data-testid="feed-sort-select"
              :options="TASK_FEED_SORT_OPTIONS"
              option-label="shortLabel"
              option-value="value"
              size="small"
              aria-label="Sort tasks by"
              class="w-24 text-xs"
            >
              <template #option="{ option }">
                <div class="flex items-center gap-2 text-xs">
                  <i :class="option.icon" class="text-[11px] opacity-70" aria-hidden="true" />
                  <span>{{ option.label }}</span>
                </div>
              </template>
            </Select>
            <Button
              type="button"
              data-testid="feed-sort-direction-btn"
              :icon="sortDirection === 'asc' ? 'pi pi-sort-amount-up-alt' : 'pi pi-sort-amount-down'"
              size="small"
              severity="secondary"
              variant="outlined"
              :title="sortDirection === 'asc' ? 'Ascending (click to switch)' : 'Descending (click to switch)'"
              :aria-label="`Sort direction: ${sortDirection === 'asc' ? 'Ascending' : 'Descending'}`"
              @click="toggleSortDirection"
            />
          </InputGroup>
        </slot>
      </template>

      <template #subheader>
        <slot name="subheader">
          <div class="flex flex-col gap-2 shrink-0">
            <Label for="feed-search-input" class="sr-only">Search tasks by title</Label>
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText
                id="feed-search-input"
                v-model="searchQuery"
                data-testid="feed-search-input"
                type="search"
                size="small"
                fluid
                placeholder="Search tasks by title..."
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
              />
              <InputIcon
                v-if="searchQuery"
                data-testid="feed-search-clear-btn"
                role="button"
                tabindex="0"
                class="pi pi-times cursor-pointer"
                aria-label="Clear search"
                @click="searchQuery = ''"
                @keydown.enter.prevent="searchQuery = ''"
                @keydown.space.prevent="searchQuery = ''"
              />
            </IconField>

            <div
              v-if="hasActiveFilters"
              data-testid="feed-active-filters"
              class="flex flex-wrap items-center gap-1.5"
            >
              <Chip
                v-for="priority in selectedPriorities"
                :key="`p-${priority}`"
                :label="`Priority: ${priorityLabel(priority)}`"
                removable
                class="py-0.5 px-2 text-[11px]"
                @remove="togglePriorityFilter(priority)"
              />
              <Chip
                v-for="tag in selectedTags"
                :key="`t-${tag}`"
                :label="`Tag: ${tag === TASK_FEED_UNTAGGED_VALUE ? 'Untagged' : tag}`"
                removable
                class="py-0.5 px-2 text-[11px]"
                @remove="toggleTagFilter(tag)"
              />
              <Button
                type="button"
                data-testid="feed-reset-filters-btn"
                label="Clear all"
                severity="secondary"
                text
                size="small"
                class="py-0.5 px-1.5 text-[11px]"
                @click="resetFilters"
              />
            </div>
          </div>
        </slot>
      </template>

      <template #task="{ task }">
        <KanbanTask :task="task" :draggable="false">
          <template #before-timer>
            <div
              data-testid="feed-task-context"
              class="mt-2 pt-1.5 border-t border-surface-200/70 dark:border-surface-800/80 flex items-center gap-1 text-[10px] font-medium text-surface-500 dark:text-surface-400 truncate"
            >
              <i class="pi pi-th-large text-[9px] text-primary shrink-0" aria-hidden="true" />
              <span class="truncate font-semibold text-surface-700 dark:text-surface-300">{{ (task as TaskFeedItemDto).boardTitle }}</span>
              <span aria-hidden="true">&rsaquo;</span>
              <span class="truncate">{{ (task as TaskFeedItemDto).columnTitle }}</span>
            </div>
          </template>
        </KanbanTask>
      </template>
    </KanbanColumn>

    <Popover ref="filterPopoverRef" aria-label="Task Feed Filters">
      <div data-testid="feed-filter-popover" class="w-72 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <span class="text-sm font-bold text-surface-900 dark:text-surface-0">Filter tasks</span>
          <Button
            type="button"
            data-testid="feed-popover-reset-btn"
            label="Reset"
            severity="secondary"
            text
            size="small"
            :disabled="!hasActiveFilters"
            @click="resetFilters"
          />
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-xs font-semibold text-surface-500 dark:text-surface-400">Priority</span>
          <div class="grid grid-cols-2 gap-1.5">
            <Button
              v-for="opt in TASK_FEED_PRIORITY_FILTER_OPTIONS"
              :key="opt.value"
              type="button"
              :data-testid="`feed-priority-filter-${opt.value}`"
              size="small"
              :severity="selectedPriorities.includes(opt.value) ? 'primary' : 'secondary'"
              :variant="selectedPriorities.includes(opt.value) ? undefined : 'outlined'"
              :aria-pressed="selectedPriorities.includes(opt.value)"
              class="justify-start text-xs"
              @click="togglePriorityFilter(opt.value)"
            >
              <span class="h-2 w-2 rounded-full shrink-0" :class="opt.dotClass" />
              <span class="truncate">{{ opt.label }}</span>
            </Button>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-surface-500 dark:text-surface-400">Tags</span>
            <span class="text-[11px] text-surface-400">{{ selectedTags.length }} selected</span>
          </div>
          <Listbox
            v-model="selectedTags"
            data-testid="feed-tag-listbox"
            :options="availableTagOptions"
            option-label="label"
            option-value="value"
            multiple
            checkmark
            :highlight-on-select="false"
            :meta-key-selection="false"
            list-style="max-height: 9.5rem"
            class="w-full text-xs"
          >
            <template #option="{ option }">
              <div class="flex items-center justify-between gap-2 w-full text-xs">
                <span :class="option.isUntagged ? 'italic text-surface-500 dark:text-surface-400' : ''">
                  {{ option.label }}
                </span>
                <Badge :value="option.count" severity="secondary" size="small" />
              </div>
            </template>
          </Listbox>
        </div>
      </div>
    </Popover>
  </template>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import type { KanbanColumnDto, TagDto, TaskFeedItemDto } from '~/api/kanban'
import KanbanColumn from '~/components/kanban/Column.vue'
import KanbanTask from '~/components/kanban/Task.vue'
import {
  TASK_FEED_PRIORITY_FILTER_OPTIONS,
  TASK_FEED_SORT_OPTIONS,
  TASK_FEED_UNTAGGED_VALUE,
  type TaskFeedPriorityFilter,
  useTaskFeedFilters,
} from '~/composables/useTaskFeedFilters'

const props = withDefaults(
  defineProps<{
    tasks: TaskFeedItemDto[]
    userTags?: TagDto[]
    loading?: boolean
    error?: unknown
    emptyText?: string
  }>(),
  {
    userTags: () => [],
    loading: false,
  },
)

const emit = defineEmits<{
  retry: []
}>()

defineSlots<{
  'header-actions'?: () => any
  subheader?: () => any
}>()

const filterPopoverRef = ref<{ toggle: (event: Event) => void } | null>(null)

const toggleFilterPopover = (event: Event): void => {
  filterPopoverRef.value?.toggle(event)
}

const {
  searchQuery,
  selectedPriorities,
  selectedTags,
  sortBy,
  sortDirection,
  availableTagOptions,
  visibleTasks,
  activeFilterCount,
  hasActiveFilters,
  emptyText: filterEmptyText,
  togglePriorityFilter,
  toggleTagFilter,
  toggleSortDirection,
  resetFilters,
} = useTaskFeedFilters(toRef(props, 'tasks'), toRef(props, 'userTags'))

const priorityLabel = (value: TaskFeedPriorityFilter): string => {
  return TASK_FEED_PRIORITY_FILTER_OPTIONS.find(opt => opt.value === value)?.label ?? value
}

const resolvedEmptyText = computed(() => props.emptyText ?? filterEmptyText.value)

const feedColumn = computed<KanbanColumnDto>(() => ({
  id: 'task-feed',
  title: 'Task Feed',
  position: 0,
  boardId: 'home',
  tasks: visibleTasks.value,
}))
</script>
