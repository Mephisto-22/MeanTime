<template>
  <div class="mx-auto max-w-md px-6 py-8">
    <h1 class="mb-6 text-2xl font-bold">Register</h1>
    <RegistrationForm :loading="loading" @submit="register" />
    <p v-if="error" role="alert" class="mt-4">{{ error }}</p>
    <p class="mt-4">
      Already have an account?
      <NuxtLink to="/login" class="text-primary underline">Log in</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { RegistrationRequest } from '~/api/auth'
import { useAuthStore } from '~/stores/useAuthStore'

const authStore = useAuthStore()
const loading = ref(false)
const error = ref('')

async function register(details: RegistrationRequest) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await authStore.register(details)
    await navigateTo('/login?registered=1')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to register. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>
