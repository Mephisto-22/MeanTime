<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" novalidate @submit.prevent="submit">
    <div class="field-group">
      <Label for="login-email">Email</Label>
      <InputText id="login-email" v-model="email" name="email" type="email" autocomplete="username" required :invalid="showEmailError" :aria-invalid="showEmailError" :aria-describedby="showEmailError ? 'login-email-error' : undefined" @input="markDirty('email')" @blur="markBlurred('email')" />
      <small v-if="showEmailError" id="login-email-error" class="field-error-text">Enter a valid email address.</small>
    </div>
    <div class="field-group">
      <Label for="login-password">Password</Label>
      <InputText id="login-password" v-model="password" name="password" type="password" autocomplete="current-password" required :invalid="showPasswordError" :aria-invalid="showPasswordError" :aria-describedby="showPasswordError ? 'login-password-error' : undefined" @input="markDirty('password')" @blur="markBlurred('password')" />
      <small v-if="showPasswordError" id="login-password-error" class="field-error-text">Enter your password.</small>
    </div>
    <Button type="submit" label="Log in" :loading="loading" :disabled="loading || !isValid" />
  </form>
</template>

<script setup lang="ts">
import { useFormValidation } from '~/composables/useFormValidation'
import { requiredText, validEmail } from '~/utils/validation'
import type { LoginRequest } from '~/api/auth'

const props = defineProps<{ loading?: boolean }>()
const email = ref('')
const password = ref('')
const { markDirty, markBlurred, markSubmitted, shouldShowError } = useFormValidation()
const showEmailError = computed(() => shouldShowError('email', !validEmail(email.value)))
const showPasswordError = computed(() => shouldShowError('password', !requiredText(password.value)))
const isValid = computed(() => validEmail(email.value) && requiredText(password.value))

const emit = defineEmits<{
  submit: [credentials: LoginRequest]
}>()

function submit() {
  markSubmitted()
  if (props.loading || !isValid.value) return
  emit('submit', { email: email.value.trim(), password: password.value })
}
</script>
