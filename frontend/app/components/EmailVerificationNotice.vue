<template>
  <div class="flex flex-col gap-4">
    <p class="text-surface-400">Open the confirmation link in your inbox before logging in. Check your spam folder too.</p>
    <Message v-if="message" severity="info" role="status">{{ message }}</Message>
    <form class="flex flex-col gap-3" novalidate :aria-busy="loading" @submit.prevent="resend">
      <Label for="confirmation-email">Email</Label>
      <InputText id="confirmation-email" v-model="email" name="email" type="email" autocomplete="email" maxlength="254" required :invalid="!validEmail(email)" :aria-invalid="!validEmail(email)" aria-describedby="confirmation-email-hint" />
      <small id="confirmation-email-hint" class="text-surface-400">Enter the email you used to register.</small>
      <Button type="submit" :label="waiting ? 'Please wait before requesting another email' : 'Resend confirmation email'" :loading="loading" :disabled="loading || waiting || !validEmail(email)" />
    </form>
    <NuxtLink to="/login" class="auth-link">Back to login</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { authApi } from '~/api/auth'
import { validEmail } from '~/utils/validation'

const props = defineProps<{ initialEmail?: string }>()
const email = ref(props.initialEmail ?? '')
const loading = ref(false)
const waiting = ref(false)
const message = ref('')
const notify = useNotifications()
let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(timer))

async function resend() {
  if (loading.value || waiting.value || !validEmail(email.value)) return
  loading.value = true
  try {
    message.value = (await authApi.resendConfirmation(email.value.trim())).detail
    waiting.value = true
    timer = setTimeout(() => { waiting.value = false }, 60000)
  } catch (error) {
    notify.error(error, 'Unable to send confirmation email')
  } finally {
    loading.value = false
  }
}
</script>
