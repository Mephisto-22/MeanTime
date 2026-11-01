<template>
  <form class="flex flex-col gap-4" :aria-busy="loading" @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <Label for="reset-email">Email</Label>
      <InputText id="reset-email" v-model="email" name="email" type="email" autocomplete="email" maxlength="254" required />
    </div>
    <Button type="submit" label="Request reset link" :loading="loading" :disabled="loading" />
  </form>
</template>

<script setup lang="ts">
const props = defineProps<{ loading?: boolean }>()
const email = ref('')
const emit = defineEmits<{ submit: [email: string] }>()

function submit() {
  if (!props.loading) emit('submit', email.value)
}
</script>
