<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" novalidate @submit.prevent="submit">
    <div class="field-group">
      <Label for="reset-email">Email</Label>
      <InputText id="reset-email" v-model="email" name="email" type="email" autocomplete="email" maxlength="254" required :invalid="showEmailError" :aria-invalid="showEmailError" :aria-describedby="showEmailError ? 'reset-email-error' : undefined" @input="markDirty('email')" @blur="markBlurred('email')" />
      <small v-if="showEmailError" id="reset-email-error" class="field-error-text">Enter a valid email address.</small>
    </div>
    <Button type="submit" label="Request reset link" :loading="loading" :disabled="loading || !isValid" />
  </form>
</template>

<script setup lang="ts">
import { useFormValidation } from '~/composables/useFormValidation'
import { validEmail } from '~/utils/validation'

const props = defineProps<{ loading?: boolean }>()
const email = ref('')
const emit = defineEmits<{ submit: [email: string] }>()
const { markDirty, markBlurred, markSubmitted, shouldShowError } = useFormValidation()

const isValid = computed(() => validEmail(email.value))
const showEmailError = computed(() => shouldShowError('email', !isValid.value))

function submit() {
  markSubmitted()
  if (props.loading || !isValid.value) return
  emit('submit', email.value.trim())
}
</script>
