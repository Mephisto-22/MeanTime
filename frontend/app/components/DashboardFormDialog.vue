<template>
  <Dialog
    v-model:visible="visible"
    data-testid="dashboard-form-dialog"
    modal
    :header="isEditing ? 'Edit dashboard' : 'New dashboard'"
    :draggable="false"
    class="w-[min(28rem,calc(100vw-2rem))]"
  >
    <form
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="save"
    >
      <div class="flex flex-col gap-2">
        <label
          for="dashboard-name"
          class="font-medium"
        >
          Name
        </label>
        <InputText
          id="dashboard-name"
          v-model="name"
          data-testid="dashboard-name-input"
          autofocus
          fluid
          :maxlength="NAME_MAX_LENGTH"
          :invalid="showNameError"
          :aria-describedby="showNameError ? 'dashboard-name-error' : undefined"
        />
        <Message
          v-if="showNameError"
          id="dashboard-name-error"
          data-testid="dashboard-name-error"
          severity="error"
          size="small"
          variant="simple"
        >
          Enter a name for the dashboard.
        </Message>
      </div>

      <div class="flex flex-col gap-2">
        <label
          for="dashboard-description"
          class="font-medium"
        >
          Description
          <span class="font-normal text-surface-500 dark:text-surface-400">
            (optional)
          </span>
        </label>
        <Textarea
          id="dashboard-description"
          v-model="description"
          data-testid="dashboard-description-input"
          rows="3"
          fluid
        />
      </div>

      <Message
        v-if="saveFailed"
        data-testid="dashboard-save-error"
        severity="error"
        :closable="false"
      >
        We couldn't save the dashboard. Try again.
      </Message>

      <div class="flex justify-end gap-2">
        <Button
          type="button"
          label="Cancel"
          severity="secondary"
          text
          :disabled="isSaving"
          @click="visible = false"
        />
        <Button
          type="submit"
          data-testid="dashboard-save-button"
          :label="isEditing ? 'Save' : 'Create'"
          :loading="isSaving"
        />
      </div>
    </form>
  </Dialog>
</template>

<script setup lang="ts">
import {dashboardApi, type Dashboard, type DashboardPayload} from '~/api';

interface Props {
  /** The dashboard to edit, or null to create a new one. */
  dashboard: Dashboard | null;
}

const NAME_MAX_LENGTH = 100;

const props = defineProps<Props>();

/** Whether the dialog is open. Bound by the parent with v-model:visible. */
const visible = defineModel<boolean>('visible', {required: true});

const dashboardsStore = useDashboardsStore();

const name = ref('');
const description = ref('');
const wasSubmitted = ref(false);
const isSaving = ref(false);
const saveFailed = ref(false);

const isEditing = computed(() => props.dashboard !== null);
const trimmedName = computed(() => name.value.trim());
const showNameError = computed(
  () => wasSubmitted.value && trimmedName.value === '',
);

// Start from a clean form every time the dialog opens, so values and errors
// from the previous use never leak into the next one.
watch(visible, isOpen => {
  if (!isOpen) {
    return;
  }
  name.value = props.dashboard?.name ?? '';
  description.value = props.dashboard?.description ?? '';
  wasSubmitted.value = false;
  saveFailed.value = false;
});

async function save(): Promise<void> {
  wasSubmitted.value = true;
  if (trimmedName.value === '' || isSaving.value) {
    return;
  }

  const payload: DashboardPayload = {
    name: trimmedName.value,
    description: description.value.trim() || undefined,
  };

  isSaving.value = true;
  saveFailed.value = false;
  try {
    if (props.dashboard !== null) {
      const updated = await dashboardApi.update(props.dashboard.id, payload);
      dashboardsStore.replaceDashboard(updated);
    } else {
      const created = await dashboardApi.create(payload);
      dashboardsStore.addDashboard(created);
    }
    visible.value = false;
  } catch {
    saveFailed.value = true;
  } finally {
    isSaving.value = false;
  }
}
</script>
