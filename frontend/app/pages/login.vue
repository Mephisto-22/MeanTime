<template>
  <div class="mx-auto max-w-md px-6 py-8">
    <Card>
      <template #title><h2 class="text-2xl font-bold">Log in</h2></template>
      <template #content>
        <p v-if="route.query.registered === '1'" role="status" class="mb-4">
          Account created. Please log in.
        </p>
        <LoginForm :loading="loading" @submit="login" />
        <p v-if="error" role="alert" class="mt-4">{{ error }}</p>
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
import { useAuthStore } from '~/stores/useAuthStore'

const authStore = useAuthStore()
const route = useRoute()
const loading = ref(false)
const error = ref('')

async function login(credentials: LoginRequest) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await authStore.login(credentials)
    await navigateTo('/')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to log in. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>
