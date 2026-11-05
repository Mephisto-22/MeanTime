<script setup lang="ts">
useHead({
  htmlAttrs: {
    class: 'dark',
    lang: 'en',
  },
})

if (import.meta.client) {
  document.documentElement.classList.add('dark')
}
</script>

<template>
  <div class="min-h-screen bg-[var(--p-surface-950)] text-[var(--p-text-color)]">
    <ClientOnly>
      <Toast position="top-right" :breakpoints="{ '480px': { width: 'calc(100% - 2rem)', right: '1rem' } }" />
    </ClientOnly>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
