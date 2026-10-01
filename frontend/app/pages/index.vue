<template>
  <div class="mx-auto max-w-7xl px-6 py-10">
    <div class="mb-10 text-center">
      <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">
        Welcome to MeanTime
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-lg text-surface-600 dark:text-surface-300">
        Full-stack containerized development environment powered by Nuxt 4, PrimeVue 5, and Tailwind CSS.
      </p>
    </div>

    <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
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
const count = ref(0)
</script>
