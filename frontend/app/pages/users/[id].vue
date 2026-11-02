<template>
  <div class="mx-auto max-w-4xl px-6 py-10">
    <!-- Top-Left Navigation Back to Boards -->
    <div class="mb-6">
      <Button
        data-testid="back-to-boards-button"
        label="Your boards"
        icon="pi pi-arrow-left"
        text
        severity="secondary"
        @click="navigateTo('/')"
      />
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
    <Card class="mb-8">
      <template #title>
        <h2 class="text-2xl font-bold">Account Information</h2>
      </template>
      <template #subtitle>
        View and manage your account details and profile preferences.
      </template>
      <template #content>
        <div class="flex flex-col gap-4">
          <!-- Username / Email (Read-Only: No Edit Button) -->
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label class="sm:w-1/3">Username / Email</Label>
            <div class="flex flex-1 items-center justify-between gap-4">
              <span data-testid="field-email">{{ currentUser?.email || 'N/A' }}</span>
              <Tag value="Read-only" severity="secondary" />
            </div>
          </div>

          <Divider />

          <!-- Display Name (Editable) -->
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label for="input-display-name" class="sm:w-1/3">Display Name</Label>
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
                <span v-else data-testid="field-display-name">{{ currentUser?.display_name || 'N/A' }}</span>
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
            <Label for="input-timezone" class="sm:w-1/3">Timezone</Label>
            <div class="flex flex-1 items-center justify-between gap-4">
              <div class="flex-1">
                <InputText
                  v-if="isEditingTimezone"
                  id="input-timezone"
                  v-model="draftTimezone"
                  data-testid="input-timezone"
                  fluid
                />
                <span v-else data-testid="field-timezone">{{ currentUser?.timezone || 'UTC' }}</span>
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

          <Divider />

          <!-- Password (Has Edit Button, but No-Op) -->
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label class="sm:w-1/3">Password</Label>
            <div class="flex flex-1 items-center justify-between gap-4">
              <span data-testid="field-password" class="tracking-widest">••••••••</span>
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
      </template>

      <!-- Save / Cancel Editing Actions -->
      <template v-if="isEditing" #footer>
        <div class="flex justify-end gap-2">
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
      </template>
    </Card>

    <!-- Danger Zone: Delete Account -->
    <Card class="border border-red-200 dark:border-red-950">
      <template #title>
        <span class="text-red-700 dark:text-red-400">Delete Account</span>
      </template>
      <template #content>
        <p class="text-sm text-surface-600 dark:text-surface-400">
          Deactivate your user account. This action cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end">
          <Button
            data-testid="delete-account-button"
            label="Delete Account"
            severity="danger"
            icon="pi pi-trash"
            @click="openDeleteDialog"
          />
        </div>
      </template>
    </Card>

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
