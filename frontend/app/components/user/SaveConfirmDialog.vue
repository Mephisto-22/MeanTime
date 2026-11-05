<template>
  <Dialog
    v-model:visible="visible"
    data-testid="save-confirm-dialog"
    modal
    header="Save Changes"
    :draggable="false"
    class="w-[min(26rem,calc(100vw-2rem))]"
  >
    <div class="py-2">
      <p class="text-surface-700 dark:text-surface-200">
        Are you sure you want to save your changes?
      </p>
    </div>

    <template #footer>
      <Button
        type="button"
        label="Cancel"
        severity="secondary"
        text
        data-testid="save-confirm-cancel-button"
        :disabled="loading"
        @click="visible = false"
      />
      <Button
        type="button"
        label="Save"
        data-testid="save-confirm-save-button"
        :loading="loading"
        @click="emit('confirm')"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
defineOptions({
  name: 'SaveConfirmDialog',
})

interface Props {
  loading?: boolean
}

interface Emits {
  (e: 'confirm'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
const visible = defineModel<boolean>('visible', { required: true })
</script>
