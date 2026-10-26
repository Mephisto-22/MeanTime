<template>
  <div class="mx-auto max-w-md px-6 py-8">
    <Card>
      <template #title><h2 class="text-2xl font-bold">Forgot password</h2></template>
      <template #content>
        <PasswordResetRequestForm v-if="!message" :loading="loading" @submit="requestReset" />
        <p v-if="message" role="status">{{ message }}</p>
        <p v-if="error" role="alert" class="mt-4">{{ error }}</p>
        <NuxtLink to="/login" class="mt-4 block text-primary underline">Back to login</NuxtLink>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { authApi } from '~/api/auth'

definePageMeta({ public: true })
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
