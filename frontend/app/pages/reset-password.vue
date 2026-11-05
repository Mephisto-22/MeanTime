<template>
  <div class="auth-card-container">
    <Card class="auth-card">
      <template #title>
        <h2 class="auth-title">Reset password</h2>
      </template>
      <template #content>
        <div class="flex flex-col gap-4">
          <Message v-if="checking" severity="info" role="status">Checking your reset link...</Message>
          <Message v-if="success" severity="success" role="status">{{ success }}</Message>
          <PasswordResetForm v-if="valid && !success" :loading="loading" @submit="resetPassword" />
          <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
          <div v-if="!checking && !valid && !success" class="pt-2 text-sm text-surface-600 dark:text-surface-400">
            <NuxtLink to="/forgot-password" class="auth-link">Request a new reset link</NuxtLink>
          </div>
          <div class="text-sm text-surface-600 dark:text-surface-400">
            <NuxtLink to="/login" class="auth-link">Back to login</NuxtLink>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { authApi, type PasswordResetLink } from '~/api/auth'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ public: true, layout: 'headless' })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const auth = useAuthStore()
const notify = useNotifications()
const checking = ref(true)
const valid = ref(false)
const loading = ref(false)
const success = ref('')
const error = ref('')
let link: PasswordResetLink | null = null

onMounted(async () => {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const uid = fragment.get('uid')
  const token = fragment.get('token')
  if (!uid || !token) {
    error.value = 'This reset link is incomplete. Request a new link.'
    checking.value = false
    return
  }
  link = { uid, token }
  try {
    await authApi.validatePasswordReset(link)
    auth.clearTokens()
    valid.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to verify the reset link. Please try again.'
  } finally {
    checking.value = false
  }
})

async function resetPassword(passwords: { password: string; password_confirm: string }) {
  if (!link || loading.value) return
  loading.value = true
  error.value = ''
  try {
    success.value = (await authApi.confirmPasswordReset({ ...link, ...passwords })).detail
    notify.success(success.value)
    auth.clearTokens()
    valid.value = false
    link = null
    window.history.replaceState(null, '', window.location.pathname)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to reset your password. Please try again.'
    notify.error(err, 'Unable to reset your password')
  } finally {
    loading.value = false
  }
}
</script>
