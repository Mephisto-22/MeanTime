<template>
  <div class="mx-auto w-full max-w-md px-4 py-8">
    <Card class="border border-surface-200 dark:border-surface-800 shadow-sm">
      <template #title>
        <h2 class="text-2xl font-bold tracking-tight">Forgot password</h2>
      </template>
      <template #content>
        <div class="flex flex-col gap-4">
          <PasswordResetRequestForm v-if="!message" :loading="loading" @submit="requestReset" />
          <Message v-if="message" severity="success" role="status">{{ message }}</Message>
          <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
          <div class="pt-2 text-sm text-surface-600 dark:text-surface-400">
            <NuxtLink to="/login" class="text-primary hover:underline">Back to login</NuxtLink>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { authApi } from '~/api/auth'

definePageMeta({ public: true, layout: 'headless' })
const loading = ref(false)
const message = ref('')
const error = ref('')

async function requestReset(email: string) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    message.value = (await authApi.requestPasswordReset(email)).detail
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to request a reset. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>
