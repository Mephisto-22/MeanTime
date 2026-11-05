<template>
  <div class="mx-auto max-w-3xl px-4 py-4 sm:py-6 sm:px-6 flex flex-col gap-4 sm:gap-5">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col gap-0.5">
        <h1 class="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-0 sm:text-3xl">
          Account Settings
        </h1>
        <p class="text-sm text-surface-500 dark:text-surface-400">
          Manage your personal details, workspace preferences, and security credentials.
        </p>
      </div>
      <Avatar
        :label="getInitials(currentUser?.display_name, currentUser?.email)"
        shape="circle"
        size="large"
        class="user-avatar-primary"
      />
    </div>

    <!-- Main Settings Card -->
    <Card class="border border-surface-200 dark:border-surface-800 shadow-sm">
      <template #content>
        <div class="flex flex-col gap-3.5">
          <!-- Row 1: Username / Email (Read-Only) -->
          <div class="profile-field-row">
            <div class="profile-field-meta">
              <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Username / Email</span>
              <span class="text-xs text-surface-500 dark:text-surface-400">Primary account identifier</span>
            </div>
            <div class="flex flex-1 items-center justify-between gap-4">
              <span data-testid="field-email" class="text-sm font-medium text-surface-700 dark:text-surface-200">
                {{ currentUser?.email || 'N/A' }}
              </span>
              <Tag value="Read-only" severity="secondary" size="small" />
            </div>
          </div>

          <Divider />

          <!-- Row 2: Display Name (Editable) -->
          <div class="profile-field-row">
            <div class="profile-field-meta">
              <label for="input-display-name" class="text-sm font-medium text-surface-900 dark:text-surface-100">Display Name</label>
              <span class="text-xs text-surface-500 dark:text-surface-400">Public name on boards and tasks</span>
            </div>
            <div class="flex flex-1 items-center justify-between gap-4">
              <div class="flex-1">
                <InputText
                  v-if="isEditingDisplayName"
                  id="input-display-name"
                  v-model="draftDisplayName"
                  data-testid="input-display-name"
                  fluid
                  autofocus
                  size="small"
                />
                <span v-else data-testid="field-display-name" class="text-sm font-medium text-surface-900 dark:text-surface-0">
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

          <Divider />

          <!-- Row 3: Timezone (Editable) -->
          <div class="profile-field-row">
            <div class="profile-field-meta">
              <label for="input-timezone" class="text-sm font-medium text-surface-900 dark:text-surface-100">Timezone</label>
              <span class="text-xs text-surface-500 dark:text-surface-400">Used for timer logs and daily summaries</span>
            </div>
            <div class="flex flex-1 items-center justify-between gap-4">
              <div class="flex-1">
                <InputText
                  v-if="isEditingTimezone"
                  id="input-timezone"
                  v-model="draftTimezone"
                  data-testid="input-timezone"
                  fluid
                  size="small"
                />
                <span v-else data-testid="field-timezone" class="text-sm font-medium text-surface-900 dark:text-surface-0 flex items-center gap-1.5">
                  <i class="pi pi-globe text-xs text-surface-400" />
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

          <Divider />

          <!-- Row 4: Password (Read-only representation with edit action) -->
          <div class="profile-field-row">
            <div class="profile-field-meta">
              <span class="text-sm font-medium text-surface-900 dark:text-surface-100">Password</span>
              <span class="text-xs text-surface-500 dark:text-surface-400">Account login credentials</span>
            </div>
            <div class="flex flex-1 items-center justify-between gap-4">
              <span data-testid="field-password" class="tracking-widest font-mono text-sm text-surface-900 dark:text-surface-0">
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
      </template>

      <!-- Save / Cancel Inline Action Bar -->
      <template v-if="isEditing" #footer>
        <div class="flex justify-end gap-2 pt-1">
          <Button
            data-testid="cancel-edit-button"
            label="Cancel"
            severity="secondary"
            text
            size="small"
            @click="cancelEditing"
          />
          <Button
            data-testid="save-profile-button"
            label="Save Changes"
            icon="pi pi-check"
            size="small"
            @click="openSaveDialog"
          />
        </div>
      </template>
    </Card>

    <!-- Danger Zone: Delete Account -->
    <div class="danger-zone-card">
      <div class="flex flex-col gap-0.5">
        <span class="text-sm font-semibold text-red-700 dark:text-red-400">Delete Account</span>
        <p class="text-xs text-surface-600 dark:text-surface-400">
          Deactivate your user account and revoke active sessions. This action cannot be undone.
        </p>
      </div>
      <Button
        data-testid="delete-account-button"
        label="Delete Account"
        severity="danger"
        variant="outlined"
        size="small"
        icon="pi pi-trash"
        class="shrink-0"
        @click="openDeleteDialog"
      />
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
const notify = useNotifications()

const currentUser = computed(() => authStore.user)

const isEditingDisplayName = ref(false)
const isEditingTimezone = ref(false)
const isEditing = computed(() => isEditingDisplayName.value || isEditingTimezone.value)

const draftDisplayName = ref('')
const draftTimezone = ref('UTC')

const isSaveDialogOpen = ref(false)
const isSaving = ref(false)

const isDeleteDialogOpen = ref(false)
const isDeleting = ref(false)
const deleteError = ref<string | null>(null)

function getInitials(name?: string, email?: string): string {
  const trimmed = name?.trim()
  if (trimmed) {
    const parts = trimmed.split(/\s+/)
    const first = parts[0]
    const last = parts[parts.length - 1]
    if (parts.length >= 2 && first && last && first[0] && last[0]) {
      return (first[0] + last[0]).toUpperCase()
    }
    if (first) {
      return first.slice(0, 1).toUpperCase()
    }
  }
  const emailTrimmed = email?.trim()
  if (emailTrimmed) {
    return emailTrimmed.slice(0, 1).toUpperCase()
  }
  return '?'
}

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
}

function openSaveDialog() {
  isSaveDialogOpen.value = true
}

async function saveChanges() {
  isSaving.value = true

  try {
    const updated = await usersApi.updateMe({
      display_name: draftDisplayName.value.trim(),
      timezone: draftTimezone.value.trim(),
    })
    authStore.setUser(updated)
    isEditingDisplayName.value = false
    isEditingTimezone.value = false
    isSaveDialogOpen.value = false
    notify.success('Account information saved successfully.')
  } catch (err: any) {
    notify.error(err, 'Failed to save account changes.')
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
    notify.error(err, 'Failed to delete account.')
  } finally {
    isDeleting.value = false
  }
}
</script>
