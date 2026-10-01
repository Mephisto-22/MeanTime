<template>
  <Card data-testid="app-card" class="shadow-md transition-shadow hover:shadow-lg">
    <template #title>
      <div class="flex items-center gap-2">
        <i v-if="icon" :class="[icon, 'text-primary']" />
        <span>{{ title }}</span>
      </div>
    </template>
    <template v-if="subtitle" #subtitle>
      <span class="text-surface-500 dark:text-surface-400">{{ subtitle }}</span>
    </template>
    <template #content>
      <div class="py-2 text-surface-700 dark:text-surface-300">
        <slot />
      </div>
    </template>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </Card>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  icon?: string
}>()
</script>
