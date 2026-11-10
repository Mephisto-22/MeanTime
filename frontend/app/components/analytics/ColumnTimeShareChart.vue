<template>
  <div class="flex flex-col items-center gap-4">
    <svg
      viewBox="0 0 120 120"
      class="size-44 shrink-0"
      role="img"
      :aria-label="ariaLabel"
      data-testid="column-share-donut"
    >
      <g :transform="`rotate(-90 ${CENTER} ${CENTER})`">
        <circle
          v-for="slice in slices"
          :key="slice.key"
          :cx="CENTER"
          :cy="CENTER"
          :r="RADIUS"
          fill="none"
          :stroke="slice.color"
          :stroke-width="RING_WIDTH"
          :stroke-dasharray="`${slice.dash} ${CIRCUMFERENCE - slice.dash}`"
          :stroke-dashoffset="-slice.offset"
          class="cursor-pointer transition-opacity duration-150"
          :class="{ 'opacity-35': activeKey !== null && activeKey !== slice.key }"
          data-testid="column-share-slice"
          @mouseenter="activeKey = slice.key"
          @mouseleave="activeKey = null"
        >
          <title>{{ slice.title }}: {{ slice.share }}%</title>
        </circle>
      </g>
      <!-- Centre: the hovered slice, otherwise the board total -->
      <text
        :x="CENTER"
        :y="CENTER - 2"
        text-anchor="middle"
        class="fill-surface-0 text-[18px] font-bold"
        data-testid="column-share-center-value"
      >
        {{ activeSlice ? `${activeSlice.share}%` : formatDurationBadge(totalSeconds) }}
      </text>
      <text
        :x="CENTER"
        :y="CENTER + 14"
        text-anchor="middle"
        class="fill-surface-400 text-[9px]"
        data-testid="column-share-center-label"
      >
        {{ activeSlice ? truncate(activeSlice.title) : 'tracked' }}
      </text>
    </svg>

    <ul class="flex w-full flex-col gap-1.5 text-sm" data-testid="column-share-legend">
      <li
        v-for="slice in slices"
        :key="slice.key"
        tabindex="0"
        data-testid="column-share-legend-item"
        class="flex cursor-default items-center gap-2 rounded-md px-1.5 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
        :class="{ 'bg-surface-800': activeKey === slice.key }"
        @mouseenter="activeKey = slice.key"
        @mouseleave="activeKey = null"
        @focus="activeKey = slice.key"
        @blur="activeKey = null"
      >
        <span class="size-2.5 shrink-0 rounded-sm" :style="{ backgroundColor: slice.color }" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate text-surface-100">{{ slice.title }}</span>
        <span class="shrink-0 tabular-nums text-surface-300">{{ slice.share }}%</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { ColumnTimeDto } from '~/api/analytics'
import { formatDurationBadge } from '~/composables/useTaskTimer'

const props = defineProps<{
  columns: ColumnTimeDto[]
  totalSeconds: number
}>()

const CENTER = 60
const RADIUS = 48
const RING_WIDTH = 16
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** Gap between slices, so neighbouring colours never touch. */
const SLICE_GAP = 1.5
/** More named slices than this and the smallest fold into "Other". */
const MAX_NAMED_SLICES = 5

/**
 * Slice colours, checked for colour-blind separation and contrast against
 * the dark card surface (#18181b). Kept in this fixed order.
 */
const SLICE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']
const OTHER_COLOR = '#71717a'

interface Slice {
  key: string
  title: string
  seconds: number
  share: number
  color: string
  dash: number
  offset: number
}

const activeKey = ref<string | null>(null)

const slices = computed<Slice[]>(() => {
  const tracked = props.columns.filter(column => column.totalSeconds > 0)

  // Keep the largest columns, still listed in board order.
  let named = tracked
  let otherSeconds = 0
  if (tracked.length > MAX_NAMED_SLICES) {
    const largest = new Set(
      [...tracked]
        .sort((a, b) => b.totalSeconds - a.totalSeconds)
        .slice(0, MAX_NAMED_SLICES)
        .map(column => column.columnId),
    )
    named = tracked.filter(column => largest.has(column.columnId))
    otherSeconds = tracked
      .filter(column => !largest.has(column.columnId))
      .reduce((sum, column) => sum + column.totalSeconds, 0)
  }

  const parts = named.map((column, index) => ({
    key: String(column.columnId),
    title: column.title,
    seconds: column.totalSeconds,
    color: SLICE_COLORS[index]!,
  }))
  if (otherSeconds > 0) {
    parts.push({ key: 'other', title: 'Other', seconds: otherSeconds, color: OTHER_COLOR })
  }

  const total = props.totalSeconds
  const gap = parts.length > 1 ? SLICE_GAP : 0
  let offset = 0
  return parts.map((part) => {
    const length = total > 0 ? (part.seconds / total) * CIRCUMFERENCE : 0
    const slice = {
      ...part,
      share: total > 0 ? Math.round((part.seconds / total) * 100) : 0,
      dash: Math.max(length - gap, 0.5),
      offset,
    }
    offset += length
    return slice
  })
})

const activeSlice = computed(() => slices.value.find(slice => slice.key === activeKey.value) ?? null)

const ariaLabel = computed(() =>
  `Share of tracked time by column: ${slices.value.map(slice => `${slice.title} ${slice.share}%`).join(', ')}`,
)

/** Keeps a long column title inside the donut's hole. */
const truncate = (text: string, max = 14): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text
</script>
