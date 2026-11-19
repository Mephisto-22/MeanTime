<template>
  <div class="auth-card-container">
    <Card class="auth-card">
      <template #title>
        <h1 class="auth-title">Register</h1>
      </template>
      <template #content>
        <div class="flex flex-col gap-4">
          <RegistrationForm :loading="loading" @submit="register" />
          <GoogleSignInButton />
          <div class="pt-2 text-sm text-surface-600 dark:text-surface-400">
            <p>
              Already have an account?
              <NuxtLink to="/login" class="auth-link">Log in</NuxtLink>
            </p>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type { RegistrationRequest } from '~/api/auth'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ public: true, layout: 'headless' })

const authStore = useAuthStore()
const loading = ref(false)
const notify = useNotifications()
const verificationEmail = useState('verification-email', () => '')

async function register(details: RegistrationRequest) {
  if (loading.value) return
  loading.value = true
  try {
    await authStore.register(details)
    verificationEmail.value = details.email
    await navigateTo('/check-email')
  } catch (err) {
    notify.error(err, 'Unable to register')
  } finally {
    loading.value = false
  }
}
</script>
