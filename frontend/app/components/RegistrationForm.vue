<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" novalidate @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <Label for="register-display-name">Display name</Label>
      <InputText :invalid="!requiredText(displayName)" :aria-invalid="!requiredText(displayName)" :aria-describedby="!requiredText(displayName) ? 'register-display-name-error' : undefined" id="register-display-name" v-model="displayName" name="display_name" maxlength="50" autocomplete="nickname" required />
      <small v-if="!requiredText(displayName)" id="register-display-name-error" class="text-red-600 dark:text-red-400">Enter a display name.</small>
    </div>
    <div class="flex flex-col gap-2">
      <Label for="register-email">Email</Label>
      <InputText :invalid="!validEmail(email)" :aria-invalid="!validEmail(email)" :aria-describedby="!validEmail(email) ? 'register-email-error' : undefined" id="register-email" v-model="email" name="email" type="email" maxlength="254" autocomplete="email" required />
      <small v-if="!validEmail(email)" id="register-email-error" class="text-red-600 dark:text-red-400">Enter a valid email address.</small>
    </div>
    <div class="flex flex-col gap-2">
      <Label for="register-password">Password</Label>
      <InputText :invalid="!validPassword(password) || (checkedKey === inputKey && requirements.some(rule => !rule.met))" :aria-invalid="!validPassword(password) || (checkedKey === inputKey && requirements.some(rule => !rule.met))" id="register-password" v-model="password" name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" aria-describedby="password-requirements" required />
      <section id="password-requirements" aria-labelledby="password-requirements-title" :aria-busy="checking">
        <h3 id="password-requirements-title" class="text-sm font-semibold">Password requirements</h3>
        <ul class="mt-2 space-y-1 text-sm" aria-live="polite">
          <li v-for="requirement in requirements" :key="requirement.id" :data-requirement="requirement.id" :data-met="requirement.met" :class="requirement.met ? 'text-green-700 dark:text-green-400' : 'text-surface-600 dark:text-surface-400'">
            <i :class="requirement.met ? 'pi pi-check-circle' : 'pi pi-circle'" aria-hidden="true" />
            <span class="sr-only">{{ requirement.met ? 'Met:' : 'Not met:' }}</span>
            {{ requirement.description }}
          </li>
        </ul>
        <p v-if="checking" role="status" class="mt-2 text-sm">Checking password requirements...</p>
        <p v-if="checkError" role="alert" class="mt-2 text-sm text-red-600 dark:text-red-400">{{ checkError }}</p>
        <Button v-if="checkError" type="button" label="Retry password check" severity="secondary" size="small" @click="checkRequirements" />
      </section>
    </div>
    <div class="flex flex-col gap-2">
      <Label for="register-password-confirm">Confirm password</Label>
      <InputText id="register-password-confirm" v-model="passwordConfirm" name="password_confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required :invalid="!passwordsMatch" :aria-invalid="!passwordsMatch" aria-describedby="register-password-match" />
      <small id="register-password-match" :class="passwordsMatch ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'" aria-live="polite">
        {{ passwordsMatch ? 'Passwords match.' : passwordConfirm ? 'Passwords do not match.' : 'Re-enter your password to confirm it.' }}
      </small>
    </div>
    <Button type="submit" label="Register" :loading="loading" :disabled="loading || !canSubmit" />
  </form>
</template>

<script setup lang="ts">
import { requiredText, validEmail, validPassword } from '~/utils/validation'
import { authApi, type PasswordRequirement, type RegistrationRequest } from '~/api/auth'

const props = defineProps<{ loading?: boolean }>()
const displayName = ref('')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const checking = ref(false)
const checkError = ref('')
const checkedKey = ref('')
const requirements = ref<PasswordRequirement[]>([
  { id: 'UserAttributeSimilarityValidator', description: 'Do not use a password too similar to your personal information.', met: false },
  { id: 'MinimumLengthValidator', description: 'Use at least 8 characters.', met: false },
  { id: 'CommonPasswordValidator', description: 'Do not use a commonly used password.', met: false },
  { id: 'NumericPasswordValidator', description: 'Do not use an entirely numeric password.', met: false },
  { id: 'MaximumLength', description: 'Use no more than 128 characters.', met: false },
])
const inputKey = computed(() => JSON.stringify([password.value, email.value.trim(), displayName.value.trim()]))
const passwordsMatch = computed(() => password.value.length > 0 && password.value === passwordConfirm.value)
const canSubmit = computed(() =>
  requiredText(displayName.value) && displayName.value.length <= 50 &&
  validEmail(email.value) && validPassword(password.value) &&
  passwordsMatch.value && !checking.value && !checkError.value && checkedKey.value === inputKey.value &&
  requirements.value.length > 0 && requirements.value.every(rule => rule.met),
)
let timer: ReturnType<typeof setTimeout> | undefined
let requestId = 0

const emit = defineEmits<{ submit: [details: RegistrationRequest] }>()

watch([password, email, displayName], () => {
  clearTimeout(timer)
  requestId++
  checkedKey.value = ''
  checkError.value = ''
  requirements.value = requirements.value.map(rule => ({ ...rule, met: false }))
  checking.value = !!password.value
  if (password.value) timer = setTimeout(checkRequirements, 300)
})

async function checkRequirements() {
  clearTimeout(timer)
  if (!password.value) return
  const id = ++requestId
  const key = inputKey.value
  checking.value = true
  checkError.value = ''
  try {
    const result = await authApi.passwordRequirements({ password: password.value, email: email.value.trim(), display_name: displayName.value.trim() })
    if (id !== requestId || key !== inputKey.value) return
    if (!Array.isArray(result.requirements) || !result.requirements.length ||
        result.requirements.some(rule => typeof rule.id !== 'string' || typeof rule.description !== 'string' || typeof rule.met !== 'boolean')) {
      throw new Error('Invalid password requirements response.')
    }
    requirements.value = result.requirements
    checkedKey.value = key
  } catch {
    if (id === requestId) checkError.value = 'Unable to check password requirements. Please try again.'
  } finally {
    if (id === requestId) checking.value = false
  }
}

onBeforeUnmount(() => { clearTimeout(timer); requestId++ })

function submit() {
  if (props.loading || !canSubmit.value) return
  // Confirmation is a local check; preserve the backend registration contract.
  emit('submit', { display_name: displayName.value.trim(), email: email.value.trim(), password: password.value })
}
</script>
