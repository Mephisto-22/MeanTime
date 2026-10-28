<template>
  <Dialog
    v-model:visible="visible"
    data-testid="delete-account-dialog"
    modal
    header="Delete Account"
    :draggable="false"
    class="w-[min(28rem,calc(100vw-2rem))]"
  >
    <div class="flex flex-col gap-4 py-2">
      <p class="text-surface-700 dark:text-surface-200">
        Are you sure you want to delete your account?
      </p>

      <div class="flex flex-col gap-2">
        <label for="delete-password-input" class="text-sm font-medium">
          Enter your password to confirm:
        </label>
        <InputText
          id="delete-password-input"
          v-model="password"
          data-testid="delete-password-input"
          type="password"
          fluid
          :invalid="showPasswordError"
          @keydown.enter="handleConfirm"
        />
        <Message
          v-if="showPasswordError"
          data-testid="delete-password-error"
          severity="error"
          size="small"
          variant="simple"
        >
          Please enter your password to confirm.
        </Message>
      </div>

      <Message
        v-if="errorMessage"
        data-testid="delete-error-message"
        severity="error"
        :closable="false"
      >
        {{ errorMessage }}
      </Message>

      <div class="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          label="Cancel"
          severity="secondary"
          text
          data-testid="delete-cancel-button"
          :disabled="loading"
          @click="handleCancel"
        />
        <Button
          type="button"
          label="Confirm Delete"
          severity="danger"
          data-testid="delete-confirm-button"
          :loading="loading"
          @click="handleConfirm"
        />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
defineOptions({
  name: 'DeleteAccountDialog',
})

interface Props {
  errorMessage?: string | null
  loading?: boolean
}

interface Emits {
  (e: 'confirm', password: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const visible = defineModel<boolean>('visible', { required: true })

const password = ref('')
const wasSubmitted = ref(false)

const showPasswordError = computed(
  () => wasSubmitted.value && !password.value.trim(),
)

watch(visible, (isOpen) => {
  if (!isOpen) {
    password.value = ''
    wasSubmitted.value = false
  }
})

function handleCancel() {
  visible.value = false
}

function handleConfirm() {
  wasSubmitted.value = true
  if (!password.value.trim() || props.loading) {
    return
  }
  emit('confirm', password.value)
}
</script>
