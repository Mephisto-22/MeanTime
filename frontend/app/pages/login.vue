<template>
  <div class="mx-auto max-w-md px-6 py-8">
    <Card>
      <template #title><h2 class="text-2xl font-bold">Log in</h2></template>
      <template #content>
        <p v-if="route.query.logout === 'unconfirmed'" role="alert" class="mb-4">
          You are signed out on this device, but server token revocation could not be confirmed.
        </p>
        <p v-if="route.query.registered === '1'" role="status" class="mb-4">
          Account created. Please log in.
        </p>
        <LoginForm :loading="loading" @submit="login" />
        <GoogleSignInButton class="mt-4" />
        <p v-if="error" role="alert" class="mt-4">{{ error }}</p>
        <NuxtLink to="/forgot-password" class="mt-4 block text-primary underline">Forgot your password?</NuxtLink>
        <p class="mt-4">
          Need an account?
          <NuxtLink to="/register" class="text-primary underline">Register</NuxtLink>
        </p>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type { LoginRequest } from '~/api/auth'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ public: true })

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
const oauthError = route.query.oauth_error
const error = ref(typeof oauthError === 'string'
  ? googleErrors[oauthError] ?? 'Google sign-in failed. Please try again.'
  : '')

async function login(credentials: LoginRequest) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await authStore.login(credentials)
    const redirect = route.query.redirect
    // Only allow same-app paths; never navigate to an external redirect target.
    const destination = typeof redirect === 'string' && redirect.startsWith('/') &&
      !redirect.startsWith('//') && !redirect.includes('\\') &&
      !/^\/(login|register)(?:[/?#]|$)/.test(redirect) ? redirect : '/'
    await navigateTo(destination)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to log in. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>
