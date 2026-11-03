<template>
  <div class="flex min-h-screen flex-col">
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-surface-200 bg-surface-0 px-6 py-4 text-center text-sm text-surface-500 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-400">
      MeanTime &copy; 2026 - Containerized Development Environment
    </footer>
  </div>
</template>
