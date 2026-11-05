<template>
  <div class="mx-auto max-w-4xl px-6 py-10 flex flex-col gap-6">
    <!-- Header -->
    <div class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold tracking-tight text-surface-900 dark:text-surface-0">
        Profile Settings
      </h1>
      <p class="text-surface-600 dark:text-surface-400">
        Manage your account credentials, personal preferences, and security settings.
      </p>
    </div>

    <!-- Error Banner -->
    <Message
      v-if="saveError"
      data-testid="profile-save-error"
      severity="error"
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
      :closable="true"
      @close="saveSuccess = false"
    >
      Account information saved successfully.
    </Message>

    <!-- Section 1: Account Information -->
    <Fieldset legend="Account Information">
      <div class="flex flex-col gap-4 text-sm text-surface-700 dark:text-surface-300">
        <!-- Username / Email (Read-Only: No Edit Button) -->
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label class="font-medium sm:w-1/3">Username / Email</label>
          <div class="flex flex-1 items-center justify-between gap-4">
            <span data-testid="field-email" class="font-medium text-surface-900 dark:text-surface-0">{{ currentUser?.email || 'N/A' }}</span>
            <Tag value="Read-only" severity="secondary" />
          </div>
        </div>
      </div>
    </Fieldset>

    <!-- Section 2: Preferences -->
    <Fieldset legend="Preferences">
      <div class="flex flex-col gap-4 text-sm text-surface-700 dark:text-surface-300">
        <!-- Display Name (Editable) -->
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label for="input-display-name" class="font-medium sm:w-1/3">Display Name</label>
          <div class="flex flex-1 items-center justify-between gap-4">
            <div class="flex-1">
              <InputText
                v-if="isEditingDisplayName"
                id="input-display-name"
                v-model="draftDisplayName"
                data-testid="input-display-name"
                fluid
                autofocus
              />
              <span v-else data-testid="field-display-name" class="font-medium text-surface-900 dark:text-surface-0">{{ currentUser?.display_name || 'N/A' }}</span>
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

        <Divider />

        <!-- Timezone (Editable) -->
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label for="input-timezone" class="font-medium sm:w-1/3">Timezone</label>
          <div class="flex flex-1 items-center justify-between gap-4">
            <div class="flex-1">
              <InputText
                v-if="isEditingTimezone"
                id="input-timezone"
                v-model="draftTimezone"
                data-testid="input-timezone"
                fluid
              />
              <span v-else data-testid="field-timezone" class="font-medium text-surface-900 dark:text-surface-0">{{ currentUser?.timezone || 'UTC' }}</span>
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

        <!-- Save / Cancel Editing Actions -->
        <div v-if="isEditing" class="flex justify-end gap-2 pt-2">
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
    </Fieldset>

    <!-- Section 3: Security -->
    <Fieldset legend="Security">
      <div class="flex flex-col gap-4 text-sm text-surface-700 dark:text-surface-300">
        <!-- Password (Has Edit Button, but No-Op) -->
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label class="font-medium sm:w-1/3">Password</label>
          <div class="flex flex-1 items-center justify-between gap-4">
            <span data-testid="field-password" class="tracking-widest font-mono text-surface-900 dark:text-surface-0">••••••••</span>
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
    </Fieldset>

    <!-- Section 4: Danger Zone -->
    <Fieldset legend="Danger Zone" class="border border-red-200 dark:border-red-950">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-surface-700 dark:text-surface-300">
        <p class="text-surface-600 dark:text-surface-400">
          Deactivate your user account. This action cannot be undone.
        </p>
        <Button
          data-testid="delete-account-button"
          label="Delete Account"
          severity="danger"
          icon="pi pi-trash"
          @click="openDeleteDialog"
        />
      </div>
    </Fieldset>

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
