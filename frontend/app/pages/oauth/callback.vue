<template>
  <div class="mx-auto max-w-md px-6 py-8">
    <Card>
      <template #title><h2 class="text-2xl font-bold">Signing in with Google</h2></template>
      <template #content>
        <p v-if="!error" role="status">Signing you in...</p>
        <template v-else>
          <p role="alert">{{ error }}</p>
          <NuxtLink to="/login" class="mt-4 block text-primary underline">Back to login</NuxtLink>
        </template>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

// The backend sends the browser here after Google sign-in, with the session's
// tokens in the URL fragment (backend/users/oauth.py).
definePageMeta({ public: true })
// Never send this page's address, tokens included, to another site.
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const auth = useAuthStore()
const error = ref('')

onMounted(async () => {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  // Take the tokens out of the address bar and history before anything else.
  window.history.replaceState(window.history.state, '', window.location.pathname)
  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  if (!accessToken || !refreshToken) {
    error.value = 'This sign-in link is incomplete. Try signing in with Google again.'
    return
  }
  try {
    await auth.loginWithTokens({ access_token: accessToken, refresh_token: refreshToken })
    await navigateTo('/', { replace: true })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to finish signing in. Please try again.'
  }
})
</script>
