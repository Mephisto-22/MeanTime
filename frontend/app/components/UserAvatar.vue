<template>
  <Avatar
    v-tooltip.top="tooltipConfig"
    :label="initials"
    :icon="initials ? undefined : 'pi pi-user'"
    shape="circle"
    :size="primeSize"
    role="img"
    :aria-label="tooltipText"
    :class="avatarClasses"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Avatar from 'primevue/avatar'
import Tooltip from 'primevue/tooltip'

export interface AvatarUser {
  display_name?: string | null
  displayName?: string | null
  email?: string | null
}

interface Props {
  user?: AvatarUser | null
  size?: 'small' | 'normal' | 'large' | 'xlarge'
  variant?: 'primary' | 'secondary'
  tooltip?: string
}

const props = withDefaults(defineProps<Props>(), {
  user: null,
  size: 'normal',
  variant: 'primary',
  tooltip: undefined,
})

const vTooltip = Tooltip

const displayName = computed(() => (props.user?.display_name ?? props.user?.displayName ?? '').trim())
const email = computed(() => (props.user?.email ?? '').trim())

const initials = computed<string | undefined>(() => {
  if (displayName.value) {
    const parts = displayName.value.split(/\s+/)
    const first = parts[0]
    const last = parts[parts.length - 1]
    if (parts.length >= 2 && first?.[0] && last?.[0]) {
      return (first[0] + last[0]).toUpperCase()
    }
    if (first?.[0]) {
      return first[0].toUpperCase()
    }
  }
  if (email.value[0]) {
    return email.value[0].toUpperCase()
  }
  return undefined
})

const fullName = computed(() => displayName.value || email.value || 'Unknown user')
const tooltipText = computed(() => props.tooltip ?? fullName.value)
const tooltipConfig = computed(() => ({ value: tooltipText.value, autoHide: false }))
const primeSize = computed<'normal' | 'large' | 'xlarge'>(() =>
  props.size === 'small' ? 'normal' : props.size,
)

const avatarClasses = computed(() => [
  !initials.value || props.variant === 'secondary'
    ? 'user-avatar-secondary'
    : 'user-avatar-primary',
  props.size === 'small' ? 'w-5 h-5 text-[10px]' : undefined,
])
</script>
