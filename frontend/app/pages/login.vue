<template>
  <div class="mx-auto w-full max-w-md px-4 py-8">
    <Card class="border border-surface-200 dark:border-surface-800 shadow-sm">
      <template #title>
        <h2 class="text-2xl font-bold tracking-tight">Log in</h2>
      </template>
      <template #content>
        <div class="flex flex-col gap-4">
          <Message v-if="route.query.logout === 'unconfirmed'" severity="warn" role="alert">
            You are signed out on this device, but server token revocation could not be confirmed.
          </Message>
          <LoginForm :loading="loading" @submit="login" />
          <GoogleSignInButton />
          <div class="flex flex-col gap-2 pt-2 text-sm text-surface-600 dark:text-surface-400">
            <NuxtLink to="/forgot-password" class="text-primary hover:underline">Forgot your password?</NuxtLink>
            <p>
              Need an account?
              <NuxtLink to="/register" class="text-primary hover:underline">Register</NuxtLink>
            </p>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type { LoginRequest } from '~/api/auth'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ public: true, layout: 'headless' })

// Why Google sign-in sent the browser back here (oauth_error in backend/users/oauth.py).
const googleErrors: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled.',
  email_in_use: 'An account with this email already exists. Log in with your email and password.',
  email_unverified: 'Your Google account\'s email address isn\'t verified, so it can\'t be used to sign in.',
  inactive: 'This account is inactive.',
  unavailable: 'Google sign-in isn\'t available right now. Log in with your email and password.',
}

const authStore = useAuthStore()
const route = useRoute()
const loading = ref(false)
const notify = useNotifications()
const oauthError = route.query.oauth_error
onMounted(async () => {
  // Let the client-only toast host mount before announcing a redirect error.
  await nextTick()
  if (route.query.registered === '1') {
    notify.success('Account created. Please log in.')
  }
  if (typeof oauthError === 'string') notify.error(new Error(googleErrors[oauthError] ?? 'Google sign-in failed. Please try again.'), 'Unable to sign in with Google')
})

async function login(credentials: LoginRequest) {
  if (loading.value) return
  loading.value = true
  try {
    await authStore.login(credentials)
    const redirect = route.query.redirect
    // Only allow same-app paths; never navigate to an external redirect target.
    const destination = typeof redirect === 'string' && redirect.startsWith('/') &&
      !redirect.startsWith('//') && !redirect.includes('\\') &&
      !/^\/(login|register)(?:[/?#]|$)/.test(redirect) ? redirect : '/'
    await navigateTo(destination)
  } catch (err) {
    notify.error(err, 'Unable to log in')
  } finally {
    loading.value = false
  }
}
</script>
