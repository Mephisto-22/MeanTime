<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" novalidate @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <Label for="register-display-name">Display name</Label>
      <InputText id="register-display-name" v-model="displayName" name="display_name" maxlength="50" autocomplete="nickname" required :invalid="!(requiredText(displayName))" :aria-invalid="!(requiredText(displayName))" :aria-describedby="!(requiredText(displayName)) ? 'register-display-name-error' : undefined" />
      <small v-if="!(requiredText(displayName))" id="register-display-name-error" class="text-red-600 dark:text-red-400">Enter a display name.</small>
    </div>
    <div class="flex flex-col gap-2">
      <Label for="register-email">Email</Label>
      <InputText id="register-email" v-model="email" name="email" type="email" autocomplete="email" required :invalid="!(validEmail(email))" :aria-invalid="!(validEmail(email))" :aria-describedby="!(validEmail(email)) ? 'register-email-error' : undefined" />
      <small v-if="!(validEmail(email))" id="register-email-error" class="text-red-600 dark:text-red-400">Enter a valid email address.</small>
    </div>
    <div class="flex flex-col gap-2">
      <Label for="register-password">Password</Label>
      <InputText id="register-password" v-model="password" name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required :invalid="!(validPassword(password))" :aria-invalid="!(validPassword(password))" :aria-describedby="!(validPassword(password)) ? 'register-password-error' : undefined" />
      <small v-if="!(validPassword(password))" id="register-password-error" class="text-red-600 dark:text-red-400">Use a password between 8 and 128 characters.</small>
    </div>
    <Button type="submit" label="Register" :loading="loading" :disabled="loading || !isValid" />
  </form>
</template>

<script setup lang="ts">
import { requiredText, validEmail, validPassword } from '~/utils/validation'
import type { RegistrationRequest } from '~/api/auth'

const props = defineProps<{ loading?: boolean }>()
const displayName = ref('')
const email = ref('')
const password = ref('')
const isValid = computed(() => requiredText(displayName.value) && displayName.value.length <= 50 && validEmail(email.value) && validPassword(password.value))

const emit = defineEmits<{
  submit: [details: RegistrationRequest]
}>()

function submit() {
  if (props.loading || !isValid.value) return
  emit('submit', { display_name: displayName.value.trim(), email: email.value.trim(), password: password.value })
}
</script>
