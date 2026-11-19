<template>
  <div class="auth-card-container">
    <Card class="auth-card">
      <template #title><h1 class="auth-title">Confirm your email</h1></template>
      <template #content>
        <div class="flex flex-col gap-4">
          <Message v-if="checking" severity="info" role="status">Confirming your email...</Message>
          <Message v-else-if="success" severity="success" role="status">{{ success }}</Message>
          <template v-else>
            <Message severity="error" role="alert">{{ error }}</Message>
            <Button v-if="token" label="Try again" @click="confirm" />
            <NuxtLink to="/check-email" class="auth-link">Request a new confirmation email</NuxtLink>
          </template>
          <NuxtLink to="/login" class="auth-link">Log in</NuxtLink>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { authApi } from '~/api/auth'
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ public: true, layout: 'headless' })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const checking = ref(true)
const success = ref('')
const error = ref('')
const verificationEmail = useState('verification-email', () => '')
let token = ''
onMounted(async () => {
  token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
  window.history.replaceState(window.history.state, '', window.location.pathname)
  if (!token) {
    error.value = 'This confirmation link is incomplete. Request a new email.'
    checking.value = false
    return
  }
  await confirm()
})
async function confirm() {
  checking.value = true
  error.value = ''
  try {
    success.value = (await authApi.confirmEmail(token)).detail
    token = ''
    verificationEmail.value = ''
  } catch (err) {
    error.value = getErrorMessage(err, 'Unable to confirm your email. Please try again.')
  } finally {
    checking.value = false
  }
}
</script>
