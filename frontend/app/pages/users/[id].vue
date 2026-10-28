<template>
  <div class="mx-auto max-w-4xl px-6 py-10">
    <!-- Top-Left Navigation Back to Boards -->
    <div class="mb-6 flex items-center justify-between">
      <Button
        data-testid="back-to-boards-button"
        label="Your boards"
        icon="pi pi-arrow-left"
        text
        severity="secondary"
        @click="navigateTo('/')"
      />
    </div>

    <!-- Page Title -->
    <div class="mb-8">
      <h2 class="text-3xl font-bold tracking-tight">Account Information</h2>
      <p class="mt-1 text-surface-600 dark:text-surface-300">
        View and manage your account details and profile preferences.
      </p>
    </div>

    <!-- Error Banner -->
    <Message
      v-if="saveError"
      data-testid="profile-save-error"
      severity="error"
      class="mb-6"
      :closable="true"
      @close="saveError = null"
    >
      {{ saveError }}
    </Message>

    <!-- Success Banner -->
    <Message
      v-if="saveSuccess"
      data-testid="profile-save-success"
      severity="success"
      class="mb-6"
      :closable="true"
      @close="saveSuccess = false"
    >
      Account information saved successfully.
    </Message>

    <!-- Account Details Card -->
    <div class="rounded-xl border border-surface-200 bg-surface-0 p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="divide-y divide-surface-200 dark:divide-surface-800">
        <!-- Username / Email (Read-Only: No Edit Button) -->
        <div class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="sm:w-1/3">
            <span class="text-sm font-semibold text-surface-700 dark:text-surface-200">Username / Email</span>
          </div>
          <div class="flex flex-1 items-center justify-between gap-4">
            <span data-testid="field-email" class="text-surface-900 dark:text-surface-0">
              {{ currentUser?.email || 'N/A' }}
            </span>
            <span class="text-xs text-surface-400 italic">Read-only</span>
          </div>
        </div>

        <!-- Display Name (Editable) -->
        <div class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="sm:w-1/3">
            <span class="text-sm font-semibold text-surface-700 dark:text-surface-200">Display Name</span>
          </div>
          <div class="flex flex-1 items-center justify-between gap-4">
            <div class="flex-1">
              <InputText
                v-if="isEditingDisplayName"
                v-model="draftDisplayName"
                data-testid="input-display-name"
                fluid
                autofocus
              />
              <span v-else data-testid="field-display-name" class="text-surface-900 dark:text-surface-0">
                {{ currentUser?.display_name || 'N/A' }}
              </span>
            </div>
            <Button
              v-if="!isEditingDisplayName"
              data-testid="edit-display-name-button"
              label="Edit"
              icon="pi pi-pencil"
              size="small"
              text
              @click="isEditingDisplayName = true"
            />
          </div>
        </div>

        <!-- Timezone (Editable) -->
        <div class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="sm:w-1/3">
            <span class="text-sm font-semibold text-surface-700 dark:text-surface-200">Timezone</span>
          </div>
          <div class="flex flex-1 items-center justify-between gap-4">
            <div class="flex-1">
              <InputText
                v-if="isEditingTimezone"
                v-model="draftTimezone"
                data-testid="input-timezone"
                fluid
              />
              <span v-else data-testid="field-timezone" class="text-surface-900 dark:text-surface-0">
                {{ currentUser?.timezone || 'UTC' }}
              </span>
            </div>
            <Button
              v-if="!isEditingTimezone"
              data-testid="edit-timezone-button"
              label="Edit"
              icon="pi pi-pencil"
              size="small"
              text
              @click="isEditingTimezone = true"
            />
          </div>
        </div>

        <!-- Password (Has Edit Button, but No-Op) -->
        <div class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="sm:w-1/3">
            <span class="text-sm font-semibold text-surface-700 dark:text-surface-200">Password</span>
          </div>
          <div class="flex flex-1 items-center justify-between gap-4">
            <span data-testid="field-password" class="text-surface-900 tracking-widest dark:text-surface-0">
              ••••••••
            </span>
            <Button
              data-testid="edit-password-button"
              label="Edit"
              icon="pi pi-pencil"
              size="small"
              text
              @click="onPasswordEdit"
            />
          </div>
        </div>
      </div>

      <!-- Save / Cancel Editing Actions -->
      <div v-if="isEditing" class="mt-6 flex justify-end gap-2 border-t border-surface-200 pt-4 dark:border-surface-800">
        <Button
          data-testid="cancel-edit-button"
          label="Cancel"
          severity="secondary"
          text
          @click="cancelEditing"
        />
        <Button
          data-testid="save-profile-button"
          label="Save"
          icon="pi pi-check"
          @click="openSaveDialog"
        />
      </div>
    </div>

    <!-- Danger Zone: Delete Account -->
    <div class="mt-12 rounded-xl border border-red-200 bg-red-50/50 p-6 dark:border-red-950 dark:bg-red-950/20">
      <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 class="text-lg font-semibold text-red-900 dark:text-red-300">Delete Account</h3>
          <p class="text-sm text-red-700 dark:text-red-400">
            Deactivate your user account. This action cannot be undone.
          </p>
        </div>
        <Button
          data-testid="delete-account-button"
          label="Delete Account"
          severity="danger"
          icon="pi pi-trash"
          @click="openDeleteDialog"
        />
      </div>
    </div>

    <!-- Confirmation Modal for Saving Changes -->
    <SaveConfirmDialog
      v-model:visible="isSaveDialogOpen"
      :loading="isSaving"
      @confirm="saveChanges"
    />

    <!-- Password Confirmation Modal for Deleting Account -->
    <DeleteAccountDialog
      v-model:visible="isDeleteDialogOpen"
      :error-message="deleteError"
      :loading="isDeleting"
      @confirm="deleteAccount"
    />
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { usersApi } from '~/api/users'
import SaveConfirmDialog from '~/components/user/SaveConfirmDialog.vue'
import DeleteAccountDialog from '~/components/user/DeleteAccountDialog.vue'

const authStore = useAuthStore()

const currentUser = computed(() => authStore.user)

const isEditingDisplayName = ref(false)
const isEditingTimezone = ref(false)
const isEditing = computed(() => isEditingDisplayName.value || isEditingTimezone.value)

const draftDisplayName = ref('')
const draftTimezone = ref('UTC')

const isSaveDialogOpen = ref(false)
const isSaving = ref(false)
const saveError = ref<string | null>(null)
const saveSuccess = ref(false)

const isDeleteDialogOpen = ref(false)
const isDeleting = ref(false)
const deleteError = ref<string | null>(null)

function syncDraft() {
  draftDisplayName.value = currentUser.value?.display_name || ''
  draftTimezone.value = currentUser.value?.timezone || 'UTC'
}

watch(
  currentUser,
  () => {
    syncDraft()
  },
  { immediate: true },
)

function onPasswordEdit() {
  // Requirement: There is no password editing implemented right now,
  // so the button shouldn't do anything specifically for password.
}

function cancelEditing() {
  syncDraft()
  isEditingDisplayName.value = false
  isEditingTimezone.value = false
  saveError.value = null
}

function openSaveDialog() {
  saveError.value = null
  isSaveDialogOpen.value = true
}

async function saveChanges() {
  isSaving.value = true
  saveError.value = null
  saveSuccess.value = false

  try {
    const updated = await usersApi.updateMe({
      display_name: draftDisplayName.value.trim(),
      timezone: draftTimezone.value.trim(),
    })
    authStore.setUser(updated)
    isEditingDisplayName.value = false
    isEditingTimezone.value = false
    isSaveDialogOpen.value = false
    saveSuccess.value = true
  } catch (err: any) {
    saveError.value = err?.message || 'Failed to save account changes.'
    isSaveDialogOpen.value = false
  } finally {
    isSaving.value = false
  }
}

function openDeleteDialog() {
  deleteError.value = null
  isDeleteDialogOpen.value = true
}

async function deleteAccount(password: string) {
  isDeleting.value = true
  deleteError.value = null

  try {
    await usersApi.deleteMe({ password })
    isDeleteDialogOpen.value = false
    authStore.clearTokens()
    await navigateTo('/login')
  } catch (err: any) {
    deleteError.value = err?.message || 'Failed to delete account.'
  } finally {
    isDeleting.value = false
  }
}
</script>
