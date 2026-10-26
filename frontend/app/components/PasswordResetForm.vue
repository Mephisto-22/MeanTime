<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <Label for="reset-password">New password</Label>
      <InputText id="reset-password" v-model="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="reset-password-confirm">Confirm new password</Label>
      <InputText id="reset-password-confirm" v-model="passwordConfirm" name="password_confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required />
    </div>
    <p v-if="mismatch" role="alert">Passwords do not match.</p>
    <Button type="submit" label="Reset password" :loading="loading" :disabled="loading" />
  </form>
</template>

<script setup lang="ts">
const props = defineProps<{ loading?: boolean }>()
const password = ref('')
const passwordConfirm = ref('')
const mismatch = ref(false)
const emit = defineEmits<{ submit: [passwords: { password: string; password_confirm: string }] }>()

function submit() {
  if (props.loading) return
  mismatch.value = password.value !== passwordConfirm.value
  if (!mismatch.value) emit('submit', { password: password.value, password_confirm: passwordConfirm.value })
}
</script>
