<template>
  <div class="mx-auto max-w-md px-6 py-8">
    <Card>
      <template #title><h2 class="text-2xl font-bold">Register</h2></template>
      <template #content>
        <RegistrationForm :loading="loading" @submit="register" />
        <p class="mt-4">
          Already have an account?
          <NuxtLink to="/login" class="text-primary underline">Log in</NuxtLink>
        </p>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type { RegistrationRequest } from '~/api/auth'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ public: true })

const authStore = useAuthStore()
const loading = ref(false)
const notify = useNotifications()

async function register(details: RegistrationRequest) {
  if (loading.value) return
  loading.value = true
  try {
    await authStore.register(details)
    notify.success('Account created. Log in to continue.')
    await navigateTo('/login')
  } catch (err) {
    notify.error(err, 'Unable to register')
  } finally {
    loading.value = false
  }
}
</script>
