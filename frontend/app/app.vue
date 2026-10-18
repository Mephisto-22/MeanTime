<template>
  <div class="min-h-screen bg-surface-50 text-surface-900 dark:bg-surface-950 dark:text-surface-100">
    <NuxtLayout>
      <NuxtPage v-if="route.meta.public === true" />
      <ClientOnly v-else>
        <NuxtPage v-if="auth.sessionInitialized && auth.isAuthenticated" />
        <p v-else role="status" class="p-6">Checking your session...</p>
        <template #fallback>
          <p role="status" class="p-6">Checking your session...</p>
        </template>
      </ClientOnly>
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const auth = useAuthStore()
</script>
