<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <Label for="reset-email">Email</Label>
      <InputText id="reset-email" v-model="email" name="email" type="email" autocomplete="email" maxlength="254" required :invalid="email.length > 0 && !isValid" />
    </div>
    <Button type="submit" label="Request reset link" :loading="loading" :disabled="loading || !isValid" />
  </form>
</template>

<script setup lang="ts">
import { validEmail } from '~/utils/validation'

const props = defineProps<{ loading?: boolean }>()
const email = ref('')
const emit = defineEmits<{ submit: [email: string] }>()

const isValid = computed(() => validEmail(email.value))

function submit() {
  if (props.loading || !isValid.value) return
  emit('submit', email.value.trim())
}
</script>
