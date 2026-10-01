<template>
  <div class="mx-auto max-w-7xl px-6 py-10">
    <div class="mb-10 text-center">
      <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">
        Welcome to MeanTime
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-lg text-surface-600 dark:text-surface-300">
        Full-stack containerized development environment powered by Nuxt 4, PrimeVue 5, and Tailwind CSS.
      </p>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Tag
          data-testid="backend-status-badge"
          :severity="backendBadge.severity"
          :value="backendBadge.label"
          :icon="backendBadge.icon"
          class="px-3 py-1.5 text-sm font-semibold"
        />
        <Tag
          v-if="databaseBadge"
          data-testid="database-status-badge"
          :severity="databaseBadge.severity"
          :value="databaseBadge.label"
          :icon="databaseBadge.icon"
          class="px-3 py-1.5 text-sm font-semibold"
        />
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          text
          rounded
          size="small"
          aria-label="Refresh status"
          :loading="status === 'pending'"
          @click="() => refresh()"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <AppCard
        title="Nuxt 4 Frontend"
        subtitle="Vue 3 & Nitro Engine"
        icon="pi pi-desktop"
      >
        <p class="text-sm leading-relaxed">
          Running on Node 22 with polling enabled for instant hot module replacement across Windows host mounts.
        </p>
        <template #footer>
          <div class="flex items-center gap-2">
            <Tag value="Nuxt 4.5.2" severity="success" />
            <Tag value="Vite HMR" severity="info" />
          </div>
        </template>
      </AppCard>

      <AppCard
        title="PrimeVue 5 Aura"
        subtitle="Design Tokens & Presets"
        icon="pi pi-palette"
      >
        <p class="text-sm leading-relaxed">
          Integrated with PrimeVue 5 design tokens, Aura preset theme, and layered Tailwind CSS compatibility.
        </p>
        <template #footer>
          <div class="flex items-center gap-2">
            <Tag value="PrimeVue 5" severity="warn" />
            <Tag value="Aura Preset" severity="secondary" />
          </div>
        </template>
      </AppCard>

      <AppCard
        title="Tailwind CSS"
        subtitle="Utility-First Styling"
        icon="pi pi-code"
      >
        <p class="text-sm leading-relaxed">
          Utility classes harmonized with PrimeVue CSS layers, providing rapid styling capabilities without conflicts.
        </p>
        <template #footer>
          <div class="flex items-center gap-2">
            <Tag value="Tailwind CSS 3.4" severity="contrast" />
            <Tag value="PrimeUI Plugin" severity="help" />
          </div>
        </template>
      </AppCard>

      <AppCard
        title="Django Ninja API"
        subtitle="ASGI & PostgreSQL 18"
        icon="pi pi-server"
      >
        <p class="text-sm leading-relaxed">
          Python 3.14 with Django Ninja running under Uvicorn, connected to PostgreSQL 18 and routed via Nitro proxy.
        </p>
        <template #footer>
          <div class="flex items-center gap-2">
            <Tag
              :value="isHealthy ? 'API Online' : 'API Offline'"
              :severity="isHealthy ? 'success' : 'danger'"
            />
            <Tag value="Python 3.14" severity="secondary" />
          </div>
        </template>
      </AppCard>
    </div>

    <div class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
      <Button
        label="PrimeVue Button"
        icon="pi pi-check"
        severity="primary"
        @click="count++"
      />
      <span class="text-sm font-medium text-surface-600 dark:text-surface-300">
        Clicks: <span class="font-bold text-primary">{{ count }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { healthApi, type HealthResponse } from '~/api/health'

const count = ref(0)
const { data: health, status, error, refresh } = await useAsyncData<HealthResponse>(
  'backend-health',
  () => healthApi.checkHealth(),
)

const healthInfo = computed(() => {
  if (health.value) {
    return health.value
  }
  if (error.value?.data && typeof error.value.data === 'object') {
    return error.value.data as Partial<HealthResponse>
  }
  return null
})

const isBackendConnected = computed(() => {
  return status.value === 'success' || Boolean(healthInfo.value?.status)
})

const isHealthy = computed(() => {
  return status.value === 'success' && health.value?.status === 'ok' && health.value?.database === 'connected'
})

const backendBadge = computed(() => {
  if (status.value === 'pending') {
    return { severity: 'info' as const, label: 'Checking Backend...', icon: 'pi pi-spin pi-spinner' }
  }
  if (isBackendConnected.value) {
    return { severity: 'success' as const, label: 'Backend Connected', icon: 'pi pi-check-circle' }
  }
  return { severity: 'danger' as const, label: 'Backend Disconnected', icon: 'pi pi-times-circle' }
})

const databaseBadge = computed(() => {
  if (status.value === 'pending') {
    return null
  }
  const dbStatus = healthInfo.value?.database
  if (dbStatus === 'connected') {
    return { severity: 'success' as const, label: 'Database: connected', icon: 'pi pi-database' }
  }
  if (dbStatus) {
    return { severity: 'danger' as const, label: `Database: ${dbStatus}`, icon: 'pi pi-database' }
  }
  return { severity: 'danger' as const, label: 'Database: unreachable', icon: 'pi pi-database' }
})
</script>
