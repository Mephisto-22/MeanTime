<template>
  <Card
    data-testid="dashboard-card"
    class="relative h-full shadow-md transition-shadow focus-within:ring-2 focus-within:ring-primary hover:shadow-lg"
  >
    <template #title>
      <div class="flex items-start justify-between gap-2">
        <!-- The after: classes stretch this link over the whole card, so clicking anywhere opens the dashboard. -->
        <NuxtLink
          :to="`/dashboards/${dashboard.id}`"
          class="min-w-0 break-words outline-none after:absolute after:inset-0 after:content-['']"
        >
          {{ dashboard.name }}
        </NuxtLink>
        <!-- relative z-10 keeps the button above the stretched link so it stays clickable. -->
        <Button
          icon="pi pi-pencil"
          severity="secondary"
          text
          rounded
          size="small"
          class="relative z-10 shrink-0"
          :aria-label="`Edit ${dashboard.name}`"
          @click="emit('edit', dashboard)"
        />
      </div>
    </template>
    <template #content>
      <p class="text-sm leading-relaxed text-surface-600 dark:text-surface-300">
        {{ dashboard.description || 'No description' }}
      </p>
    </template>
  </Card>
</template>

<script setup lang="ts">
import type {Dashboard} from '~/api';

interface Props {
  dashboard: Dashboard;
}

interface Emits {
  /** Fired when the user asks to edit this dashboard. */
  edit: [dashboard: Dashboard];
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>
