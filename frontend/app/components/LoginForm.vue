<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" novalidate @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <Label for="login-email">Email</Label>
      <InputText id="login-email" v-model="email" name="email" type="email" autocomplete="username" required :invalid="!(validEmail(email))" :aria-invalid="!(validEmail(email))" :aria-describedby="!(validEmail(email)) ? 'login-email-error' : undefined" />
      <small v-if="!(validEmail(email))" id="login-email-error" class="text-red-600 dark:text-red-400">Enter a valid email address.</small>
    </div>
    <div class="flex flex-col gap-2">
      <Label for="login-password">Password</Label>
      <InputText id="login-password" v-model="password" name="password" type="password" autocomplete="current-password" required :invalid="!(requiredText(password))" :aria-invalid="!(requiredText(password))" :aria-describedby="!(requiredText(password)) ? 'login-password-error' : undefined" />
      <small v-if="!(requiredText(password))" id="login-password-error" class="text-red-600 dark:text-red-400">Enter your password.</small>
    </div>
    <Button type="submit" label="Log in" :loading="loading" :disabled="loading || !isValid" />
  </form>
</template>

<script setup lang="ts">
import { requiredText, validEmail } from '~/utils/validation'
import type { LoginRequest } from '~/api/auth'

const props = defineProps<{ loading?: boolean }>()
const email = ref('')
const password = ref('')
const isValid = computed(() => validEmail(email.value) && requiredText(password.value))

const emit = defineEmits<{
  submit: [credentials: LoginRequest]
}>()

function submit() {
  if (props.loading || !isValid.value) return
  emit('submit', { email: email.value.trim(), password: password.value })
}
</script>
