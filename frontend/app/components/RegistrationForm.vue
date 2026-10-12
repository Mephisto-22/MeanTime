<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <Label for="register-username">Display name</Label>
      <InputText id="register-username" v-model="username" name="username" autocomplete="nickname" required />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="register-email">Email</Label>
      <InputText id="register-email" v-model="email" name="email" type="email" autocomplete="email" required />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="register-password">Password</Label>
      <InputText id="register-password" v-model="password" name="password" type="password" autocomplete="new-password" required />
    </div>
    <Button type="submit" label="Register" :loading="loading" :disabled="loading" />
  </form>
</template>

<script setup lang="ts">
import type { RegistrationRequest } from '~/api/auth'

const props = defineProps<{ loading?: boolean }>()
const username = ref('')
const email = ref('')
const password = ref('')

const emit = defineEmits<{
  submit: [details: RegistrationRequest]
}>()

function submit() {
  if (props.loading) return
  emit('submit', { username: username.value, email: email.value, password: password.value })
}
</script>
