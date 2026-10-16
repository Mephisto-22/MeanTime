<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <Label for="login-email">Email</Label>
      <InputText id="login-email" v-model="email" name="email" type="email" autocomplete="username" required />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="login-password">Password</Label>
      <InputText id="login-password" v-model="password" name="password" type="password" autocomplete="current-password" required />
    </div>
    <Button type="submit" label="Log in" :loading="loading" :disabled="loading" />
  </form>
</template>

<script setup lang="ts">
import type { LoginRequest } from '~/api/auth'

const props = defineProps<{ loading?: boolean }>()
const email = ref('')
const password = ref('')

const emit = defineEmits<{
  submit: [credentials: LoginRequest]
}>()

function submit() {
  if (props.loading) return
  emit('submit', { email: email.value, password: password.value })
}
</script>
