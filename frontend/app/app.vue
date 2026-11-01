<template>
  <div class="min-h-screen bg-surface-50 text-surface-900 dark:bg-surface-950 dark:text-surface-100">
    <ClientOnly>
      <Toast position="top-right" :breakpoints="{ '480px': { width: 'calc(100% - 2rem)', right: '1rem' } }" />
    </ClientOnly>
    <NuxtLayout>
      <NuxtPage/>
    </NuxtLayout>
  </div>
</template>
