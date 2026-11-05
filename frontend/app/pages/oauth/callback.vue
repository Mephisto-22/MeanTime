<template>
  <div class="mx-auto w-full max-w-md px-4 py-8">
    <Card class="border border-surface-200 dark:border-surface-800 shadow-sm">
      <template #title>
        <h2 class="text-2xl font-bold tracking-tight">Signing in with Google</h2>
      </template>
      <template #content>
        <div class="flex flex-col gap-4">
          <Message v-if="!error" severity="info" role="status">Signing you in...</Message>
          <template v-else>
            <Message severity="error" role="alert">{{ error }}</Message>
            <div class="pt-2 text-sm text-surface-600 dark:text-surface-400">
              <NuxtLink to="/login" class="text-primary hover:underline">Back to login</NuxtLink>
            </div>
          </template>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

// The backend sends the browser here after Google sign-in, with the session's
// tokens in the URL fragment (backend/users/oauth.py).
definePageMeta({ public: true, layout: 'headless' })
// Never send this page's address, tokens included, to another site.
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const auth = useAuthStore()
const notify = useNotifications()
const error = ref('')

onMounted(async () => {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  // Take the tokens out of the address bar and history before anything else.
  window.history.replaceState(window.history.state, '', window.location.pathname)
  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  if (!accessToken || !refreshToken) {
    error.value = 'This sign-in link is incomplete. Try signing in with Google again.'
    notify.error(new Error(error.value), 'Google sign-in failed')
    return
  }
  try {
    await auth.loginWithTokens({ access_token: accessToken, refresh_token: refreshToken })
    notify.success('Signed in with Google.')
    await navigateTo('/', { replace: true })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to finish signing in. Please try again.'
    notify.error(err, 'Unable to finish signing in')
  }
})
</script>
