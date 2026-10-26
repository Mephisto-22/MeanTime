<template>
  <div class="mx-auto max-w-md px-6 py-8">
    <Card>
      <template #title><h2 class="text-2xl font-bold">Reset password</h2></template>
      <template #content>
        <p v-if="checking" role="status">Checking your reset link...</p>
        <p v-if="success" role="status">{{ success }}</p>
        <PasswordResetForm v-if="valid && !success" :loading="loading" @submit="resetPassword" />
        <p v-if="error" role="alert" class="mt-4">{{ error }}</p>
        <NuxtLink v-if="!checking && !valid && !success" to="/forgot-password" class="mt-4 block text-primary underline">Request a new reset link</NuxtLink>
        <NuxtLink to="/login" class="mt-4 block text-primary underline">Back to login</NuxtLink>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { authApi, type PasswordResetLink } from '~/api/auth'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ public: true })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const auth = useAuthStore()
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
    auth.clearTokens()
    valid.value = false
    link = null
    window.history.replaceState(null, '', window.location.pathname)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to reset your password. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>
