<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" @submit.prevent="submit">
    <div class="field-group">
      <Label for="reset-password">New password</Label>
      <InputText id="reset-password" v-model="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required />
    </div>
    <div class="field-group">
      <Label for="reset-password-confirm">Confirm new password</Label>
      <InputText id="reset-password-confirm" v-model="passwordConfirm" name="password_confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required />
    </div>
    <Message v-if="mismatch" severity="error" role="alert">Passwords do not match.</Message>
    <Button type="submit" label="Reset password" :loading="loading" :disabled="loading || !canSubmit" />
  </form>
</template>

<script setup lang="ts">
const props = defineProps<{ loading?: boolean }>()
const password = ref('')
const passwordConfirm = ref('')
const mismatch = ref(false)
const emit = defineEmits<{ submit: [passwords: { password: string; password_confirm: string }] }>()

const canSubmit = computed(() => Boolean(password.value && passwordConfirm.value))

function submit() {
  if (props.loading || !canSubmit.value) return
  mismatch.value = password.value !== passwordConfirm.value
  if (!mismatch.value) emit('submit', { password: password.value, password_confirm: passwordConfirm.value })
}
</script>
