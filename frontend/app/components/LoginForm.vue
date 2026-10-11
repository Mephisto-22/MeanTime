<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <label for="login-username">Username</label>
      <InputText id="login-username" v-model="username" name="username" autocomplete="username" required />
    </div>
    <div class="flex flex-col gap-2">
      <label for="login-password">Password</label>
      <InputText id="login-password" v-model="password" name="password" type="password" autocomplete="current-password" required />
    </div>
    <Button type="submit" label="Log in" :loading="loading" :disabled="loading" />
  </form>
</template>

<script setup lang="ts">
import type { LoginRequest } from '~/api/auth'

const props = defineProps<{ loading?: boolean }>()
const username = ref('')
const password = ref('')

const emit = defineEmits<{
  submit: [credentials: LoginRequest]
}>()

function submit() {
  if (props.loading) return
  emit('submit', { username: username.value, password: password.value })
}
</script>
