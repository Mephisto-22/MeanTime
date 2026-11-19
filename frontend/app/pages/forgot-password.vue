<template>
  <div class="auth-card-container">
    <Card class="auth-card">
      <template #title>
        <h1 class="auth-title">Forgot password</h1>
      </template>
      <template #content>
        <div class="flex flex-col gap-4">
          <PasswordResetRequestForm v-if="!message" :loading="loading" @submit="requestReset" />
          <Message v-if="message" severity="success" role="status">{{ message }}</Message>
          <template v-if="message">
            <p class="text-sm text-surface-400">Check your inbox and spam folder. Open the link to choose a new password. If no email arrives, check the address and try again.</p>
            <Button label="Request another link" severity="secondary" @click="message = ''" />
          </template>
          <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
          <div class="pt-2 text-sm text-surface-600 dark:text-surface-400">
            <NuxtLink to="/login" class="auth-link">Back to login</NuxtLink>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { authApi } from '~/api/auth'

definePageMeta({ public: true, layout: 'headless' })
const notify = useNotifications()
const loading = ref(false)
const message = ref('')
const error = ref('')

async function requestReset(email: string) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    message.value = (await authApi.requestPasswordReset(email)).detail
    notify.success(message.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to request a reset. Please try again.'
    notify.error(err, 'Unable to request a reset')
  } finally {
    loading.value = false
  }
}
</script>
