<template>
  <Card
    data-testid="task-timer-editor"
    class="border border-surface-200 dark:border-surface-800 shadow-xs"
    :pt="{ body: 'p-4 flex flex-col gap-4', content: 'p-0 flex flex-col gap-4' }"
  >
    <template #content>
      <!-- Section Header with Mode Dropdown & Status -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-200/80 pb-3 dark:border-surface-800">
        <div class="flex items-center gap-2">
          <i class="pi pi-hourglass text-amber-500 text-sm" />
          <h3 class="text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-surface-300">
            Timer
          </h3>
        </div>

        <!-- Mode Selector: Clean Select Dropdown -->
        <div class="flex items-center gap-2">
          <Label for="timer-mode-select" class="text-xs text-surface-500">Mode:</Label>
          <Select
            id="timer-mode-select"
            v-model="localTimer.mode"
            :options="modeOptions"
            option-label="label"
            option-value="value"
            size="small"
            :disabled="isRunning || isPaused"
            class="!text-xs !w-44"
            data-testid="timer-mode-select"
            @change="onModeChange"
          />
        </div>
      </div>

      <!-- Asymmetric 2-Column Split: Left Focus Desk (42%) & Right Activity Chronicle (58%) -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-5">
        <!-- Left Column: Active Focus Instrument (5 cols / ~42%) -->
        <div class="flex flex-col gap-3 md:col-span-5 md:pr-4 md:border-r md:border-surface-200 dark:md:border-surface-800">

          <!-- If Mode is NONE: Clean Callout to Enable -->
          <Card
            v-if="localTimer.mode === 'NONE'"
            class="border border-dashed border-surface-200 dark:border-surface-800 text-surface-400 text-xs text-center shadow-none bg-transparent"
            :pt="{ body: 'p-6 flex flex-col items-center justify-center gap-2', content: 'p-0 flex flex-col items-center gap-2' }"
          >
            <template #content>
              <i class="pi pi-clock text-lg opacity-40" />
              <span>Timer disabled for this task.</span>
              <Button
                label="Enable Countdown (25m)"
                size="small"
                text
                class="!text-xs"
                @click="setMode('COUNT_DOWN')"
              />
            </template>
          </Card>

          <!-- Active Focus Stage -->
          <template v-else>
            <!-- Countdown Duration Config: Presets + Custom Target Input -->
            <div v-if="localTimer.mode === 'COUNT_DOWN'" class="flex flex-col gap-2">
              <div class="flex items-center justify-between text-[11px] text-surface-600 dark:text-surface-400">
                <Label class="font-medium">Target duration:</Label>
                <Tag
                  :value="`${targetMinutes} min`"
                  severity="secondary"
                  class="font-bold text-surface-900 dark:text-surface-100 font-mono !text-[11px] !py-0.5 !px-2"
                />
              </div>

              <!-- Quick-Pick Presets -->
              <div class="flex items-center gap-1.5">
                <Button
                  v-for="p in [15, 25, 45, 60]"
                  :key="p"
                  type="button"
                  :label="`${p}m`"
                  size="small"
                  :severity="targetMinutes === p ? 'primary' : 'secondary'"
                  :outlined="targetMinutes !== p"
                  :disabled="isRunning || isPaused"
                  class="!text-xs !py-1 !px-2 flex-1 cursor-pointer"
                  :data-testid="`timer-preset-${p}`"
                  @click="setPresetMinutes(p)"
                />
              </div>
            </div>

            <!-- Digital Readout Display Slab (Double-Click to Edit Custom Target) -->
            <Card
              class="group text-center border border-surface-200/80 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-800/60 shadow-none"
              :class="{ 'ring-2 ring-primary-500/50 bg-primary-50/20 dark:bg-primary-950/20': isEditingTarget }"
              :pt="{ body: 'p-4 flex flex-col items-center justify-center gap-1', content: 'p-0 w-full flex flex-col items-center gap-1' }"
            >
              <template #content>
                <!-- Header Label / Inline Edit Prompt -->
                <div class="flex items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-wider text-surface-400">
                  <span v-if="isEditingTarget" class="text-primary-600 dark:text-primary-400 flex items-center gap-1">
                    <i class="pi pi-pencil text-[9px]" />
                    (e.g. 30, 45:00)
                  </span>
                  <span v-else>
                    {{ isRunning ? 'Remaining Time' : (isPaused ? 'Paused At' : 'Target Interval') }}
                  </span>
                </div>

                <!-- Readout when NOT editing -->
                <div
                  v-if="!isEditingTarget"
                  data-testid="timer-digital-readout"
                  class="font-mono text-3xl font-bold tracking-normal tabular-nums text-surface-900 dark:text-surface-100 select-none"
                  :class="{
                    'cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 hover:scale-[1.02]': !isRunning && !isPaused && localTimer.mode === 'COUNT_DOWN'
                  }"
                  :title="(!isRunning && !isPaused && localTimer.mode === 'COUNT_DOWN') ? 'Double-click to set custom target' : undefined"
                  @dblclick="startEditingTarget"
                >
                  {{ displayTime }}
                </div>

                <!-- Inline Input when double-clicked -->
                <div v-else class="flex items-center justify-center py-0.5">
                  <InputText
                    ref="targetInputRef"
                    v-model="targetInputText"
                    type="text"
                    maxlength="8"
                    class="font-mono !text-3xl !font-bold !tracking-normal !tabular-nums !text-center !bg-transparent !border-0 !border-b-2 !border-primary-500 !text-surface-900 dark:!text-surface-100 focus:!outline-none !w-36 !py-0 !shadow-none"
                    data-testid="timer-inline-target-input"
                    placeholder="25:00"
                    @keydown.enter="commitTargetInput"
                    @keydown.esc="cancelTargetEditing"
                    @blur="commitTargetInput"
                  />
                </div>

                <!-- Double-Click Hint (Shown when IDLE in COUNT_DOWN mode) -->
                <div
                  v-if="!isEditingTarget && !isRunning && !isPaused && localTimer.mode === 'COUNT_DOWN'"
                  class="text-[10px] text-surface-400 opacity-60 flex items-center justify-center gap-1 cursor-pointer select-none"
                  title="Double-click to edit custom target"
                  @click="startEditingTarget"
                >
                  <i class="pi pi-pencil text-[8px]" />
                  <span>Double-click timer to set time</span>
                </div>

                <!-- Hairline Progress Line -->
                <div v-if="localTimer.mode === 'COUNT_DOWN'" class="w-full mt-2">
                  <ProgressBar
                    :value="progressPercent"
                    :show-value="false"
                    class="!h-1.5 rounded-full overflow-hidden"
                  />
                  <div class="flex justify-between text-[10px] text-surface-400 mt-1">
                    <span>{{ progressPercent }}% elapsed</span>
                    <span>{{ formatDigital(elapsedSeconds) }}</span>
                  </div>
                </div>
              </template>
            </Card>

            <!-- 3 Persistent Rounded-Square Buttons Across the Bottom (Evenly Stretched Full Width) -->
            <div class="grid grid-cols-3 gap-2 w-full pt-1">
              <!-- 1. Start / Resume Button (Disabled when RUNNING) -->
              <Button
                type="button"
                severity="primary"
                :disabled="isRunning"
                class="!w-full !h-10 rounded-lg flex items-center justify-center cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
                style="width: 100% !important;"
                :title="isPaused ? 'Resume Focus Session' : 'Start Focus Session'"
                :aria-label="isPaused ? 'Resume Focus Session' : 'Start Focus Session'"
                data-testid="timer-btn-start"
                @click="handleStart"
              >
                <i class="pi pi-play text-base" />
              </Button>

              <!-- 2. Pause Button (Disabled when NOT RUNNING) -->
              <Button
                type="button"
                severity="warn"
                :disabled="!isRunning"
                class="!w-full !h-10 rounded-lg flex items-center justify-center cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
                style="width: 100% !important;"
                title="Pause Focus Session"
                aria-label="Pause Focus Session"
                data-testid="timer-btn-pause"
                @click="handlePause"
              >
                <i class="pi pi-pause text-base" />
              </Button>

              <!-- 3. Stop Button (Disabled when IDLE) -->
              <Button
                type="button"
                severity="danger"
                outlined
                :disabled="isIdle"
                class="!w-full !h-10 rounded-lg flex items-center justify-center cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
                style="width: 100% !important;"
                title="Stop & Save Session"
                aria-label="Stop & Save Session"
                data-testid="timer-btn-stop"
                @click="() => handleStop()"
              >
                <i class="pi pi-stop text-base" />
              </Button>
            </div>
          </template>
        </div>

        <!-- Right Column: Activity Chronicle & Past Work (7 cols / ~58%) -->
        <div class="flex flex-col gap-3 md:col-span-7">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs font-medium text-surface-500">
              <Label class="text-xs font-medium text-surface-500">Logs</Label>
              <Tag
                :value="`(${entries.length})`"
                severity="secondary"
                rounded
                class="!text-[10px] !py-0 !px-1.5 font-bold"
              />
              <span v-if="totalDurationSeconds > 0" class="text-xs text-primary-600 dark:text-primary-400 font-semibold">
                &bull; {{ formatDurationBadge(totalDurationSeconds) }} total
              </span>
            </div>

            <Button
              type="button"
              icon="pi pi-plus"
              :label="'Log past work'"
              size="small"
              text
              class="!text-xs !py-0.5"
              data-testid="btn-toggle-log-past-work"
              @click="toggleManualLog"
            />
          </div>

          <!-- "Log Past Work" Form with Start/End Times and Symmetrical Grid Spacing -->
          <Card
            v-if="isManualLogOpen"
            data-testid="manual-work-form"
            class="border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/80 shadow-xs"
            :pt="{ body: 'p-3.5 flex flex-col gap-3 text-xs', content: 'p-0 flex flex-col gap-3' }"
          >
            <template #content>
              <div class="flex items-center justify-between border-b border-surface-200 dark:border-surface-700 pb-2">
                <span class="font-bold text-surface-800 dark:text-surface-100">Log Past Work Session</span>
                <span class="text-[10px] text-surface-400 font-mono">Calculated duration: {{ formatDurationBadge((Number(manualDurationMinutes) || 0) * 60) }}</span>
              </div>

              <!-- Row 1: Date (Flex-1) and Duration (Fixed Width Stepper) -->
              <div class="flex items-center gap-3">
                <!-- Date (takes natural expanded space) -->
                <div class="flex-1 min-w-0 flex flex-col gap-1">
                  <Label for="manual-date" class="text-[10px] font-semibold text-surface-500">Date</Label>
                  <InputText
                    id="manual-date"
                    v-model="manualDate"
                    type="date"
                    fluid
                    class="!text-xs !py-1.5 !px-2.5"
                    data-testid="manual-input-date"
                  />
                </div>

                <!-- Duration (compact dedicated stepper) -->
                <div class="w-28 shrink-0 flex flex-col gap-1">
                  <Label for="manual-duration-mins" class="text-[10px] font-semibold text-surface-500">Duration</Label>
                  <InputNumber
                    id="manual-duration-mins"
                    v-model="manualDurationMinutes"
                    suffix=" min"
                    :min="1"
                    :max="1440"
                    fluid
                    input-class="!text-xs !py-1.5 !px-2 !text-center"
                    data-testid="manual-input-duration"
                    @update:model-value="onManualDurationInputChanged"
                  />
                </div>
              </div>

              <!-- Row 2: Start Time and End Time (Spacious 2-Column Split) -->
              <div class="grid grid-cols-2 gap-3">
                <!-- Start Time -->
                <div class="flex flex-col gap-1">
                  <Label for="manual-start-time" class="text-[10px] font-semibold text-surface-500">Start Time</Label>
                  <InputText
                    id="manual-start-time"
                    v-model="manualStartTime"
                    type="time"
                    fluid
                    class="!text-xs !py-1.5 !px-2.5"
                    data-testid="manual-input-start-time"
                    @change="onManualTimeInputChanged"
                  />
                </div>

                <!-- End Time -->
                <div class="flex flex-col gap-1">
                  <Label for="manual-end-time" class="text-[10px] font-semibold text-surface-500">End Time</Label>
                  <InputText
                    id="manual-end-time"
                    v-model="manualEndTime"
                    type="time"
                    fluid
                    class="!text-xs !py-1.5 !px-2.5"
                    data-testid="manual-input-end-time"
                    @change="onManualTimeInputChanged"
                  />
                </div>
              </div>

              <!-- Row: Recorded by Dropdown (When on Shared Board) -->
              <div v-if="isShared" class="flex flex-col gap-1">
                <Label for="manual-recorded-by" class="text-[10px] font-semibold text-surface-500">Recorded by</Label>
                <Select
                  id="manual-recorded-by"
                  v-model="manualUserId"
                  :options="members"
                  option-label="display_name"
                  option-value="id"
                  placeholder="Select contributor"
                  fluid
                  class="!text-xs"
                  data-testid="manual-select-recorded-by"
                >
                  <template #value="slotProps">
                    <div v-if="slotProps.value" class="flex items-center gap-2">
                      <Avatar
                        :label="getUserInitials(getMemberById(slotProps.value))"
                        shape="circle"
                        size="small"
                        class="user-avatar-primary !w-5 !h-5 text-[10px] font-bold"
                      />
                      <span class="text-xs">{{ getMemberName(slotProps.value) }}</span>
                    </div>
                    <span v-else class="text-surface-400 text-xs">Select contributor</span>
                  </template>
                  <template #option="slotProps">
                    <div class="flex items-center gap-2 py-0.5">
                      <Avatar
                        :label="getUserInitials(slotProps.option)"
                        shape="circle"
                        size="small"
                        class="user-avatar-primary !w-5 !h-5 text-[10px] font-bold"
                      />
                      <span class="text-xs">{{ getUserDisplayName(slotProps.option) }}</span>
                    </div>
                  </template>
                </Select>
              </div>

              <!-- Row 3: Note Field (Dedicated Full-Width Space) -->
              <div class="flex flex-col gap-1">
                <Label for="manual-session-note" class="text-[10px] font-semibold text-surface-500">Session Note</Label>
                <InputText
                  id="manual-session-note"
                  v-model="manualNote"
                  placeholder="Add a session note"
                  fluid
                  class="!text-xs !py-1.5"
                  data-testid="manual-input-note"
                />
              </div>

              <!-- Row 4: Action Buttons -->
              <div class="flex justify-end gap-2 pt-1 border-t border-surface-200/80 dark:border-surface-700">
                <Button
                  label="Cancel"
                  size="small"
                  text
                  severity="secondary"
                  class="!text-xs"
                  @click="isManualLogOpen = false"
                />
                <Button
                  label="Record Session"
                  icon="pi pi-check"
                  size="small"
                  severity="primary"
                  class="!text-xs"
                  data-testid="manual-save-btn"
                  @click="submitManualEntry"
                />
              </div>
            </template>
          </Card>

          <!-- Sessions List (With Full Time & Duration Editing) -->
          <div v-if="entries.length > 0" class="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            <Card
              v-for="entry in entries"
              :key="entry.id"
              :data-testid="`session-entry-${entry.id}`"
              class="group relative border border-surface-200/90 bg-surface-50/50 hover:bg-surface-50 dark:border-surface-800 dark:bg-surface-800/40 dark:hover:bg-surface-800/80 shadow-none"
              :pt="{ body: 'p-3 flex flex-col gap-2 text-xs', content: 'p-0 flex flex-col gap-2' }"
            >
              <template #content>
                <!-- Normal View (When Not Editing this Entry) -->
                <template v-if="editingEntryId !== entry.id">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 flex-wrap">
                      <Tag
                        :value="formatDurationBadge(entry.durationSeconds)"
                        class="font-mono text-[11px] font-bold !bg-primary-100/70 !text-primary-700 dark:!bg-primary-950 dark:!text-primary-300 !border-0"
                      />
                      <span class="text-[11px] text-surface-500 font-medium">
                        {{ formatDateLabel(entry.startedAt) }} &bull; {{ formatTimeRange(entry.startedAt, entry.endedAt) }}
                      </span>
                      <span
                        v-if="getPauseSeconds(entry) >= 60"
                        class="text-[10px] text-surface-400 font-normal"
                        data-testid="session-pause-indicator"
                      >
                        ({{ formatDurationBadge(getPauseSeconds(entry)) }} paused)
                      </span>
                    </div>

                    <!-- Actions: Edit & Delete -->
                    <div class="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        icon="pi pi-pencil"
                        size="small"
                        text
                        severity="secondary"
                        class="!h-6 !w-6 !p-0 text-surface-500 hover:text-surface-900 dark:hover:text-surface-100"
                        title="Edit session time & duration"
                        aria-label="Edit session"
                        :data-testid="`btn-edit-session-${entry.id}`"
                        @click="startEditingSession(entry)"
                      />
                      <Button
                        type="button"
                        icon="pi pi-trash"
                        size="small"
                        text
                        severity="danger"
                        class="!h-6 !w-6 !p-0 text-surface-400 hover:text-red-500"
                        title="Delete session"
                        aria-label="Delete session"
                        :data-testid="`btn-delete-session-${entry.id}`"
                        @click="deleteEntry(entry.id)"
                      />
                    </div>
                  </div>

                  <!-- Bottom Row: Session Note & Contributor Avatar on Shared Boards -->
                  <div class="flex items-end justify-between gap-2">
                    <p
                      class="text-surface-700 dark:text-surface-200 text-xs leading-relaxed cursor-pointer hover:text-primary-600 transition-colors flex-1"
                      title="Click to edit session"
                      @click="startEditingSession(entry)"
                    >
                      {{ entry.note || '(No session note recorded)' }}
                    </p>
                    <Avatar
                      v-if="isShared"
                      v-tooltip="getUserTooltip(entry.user)"
                      :title="getUserTooltip(entry.user)"
                      :label="entry.user ? getUserInitials(entry.user) : undefined"
                      :icon="entry.user ? undefined : 'pi pi-user'"
                      shape="circle"
                      size="normal"
                      class="shrink-0 text-[10px] font-bold"
                      :class="entry.user ? 'user-avatar-primary' : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300'"
                      :data-testid="`time-entry-avatar-${entry.id}`"
                    />
                  </div>
                </template>

                <!-- Inline Session Editor (When Editing this Entry) -->
                <Card
                  v-else
                  data-testid="inline-session-editor"
                  class="border border-primary-200 dark:border-primary-800 bg-surface-0 dark:bg-surface-900 shadow-none"
                  :pt="{ body: 'p-2.5 flex flex-col gap-2.5', content: 'p-0 flex flex-col gap-2.5' }"
                >
                  <template #content>
                    <div class="text-[11px] font-bold text-primary-600 dark:text-primary-400">
                      Edit Work Session
                    </div>

                    <!-- Editable Timestamps & Duration (Spacious Multi-Row Layout) -->
                    <!-- Row 1: Date + Duration Stepper -->
                    <div class="flex items-center gap-2.5">
                      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                        <Label class="text-[10px] font-semibold text-surface-500">Date</Label>
                        <InputText
                          v-model="editDate"
                          type="date"
                          fluid
                          class="!text-xs !py-1 !px-2"
                        />
                      </div>
                      <div class="w-28 shrink-0 flex flex-col gap-0.5">
                        <Label class="text-[10px] font-semibold text-surface-500">Duration</Label>
                        <InputNumber
                          v-model="editDurationMinutes"
                          suffix=" min"
                          :min="1"
                          :max="1440"
                          fluid
                          input-class="!text-xs !py-1 !px-2 !text-center"
                          data-testid="edit-session-duration"
                          @update:model-value="onEditDurationChanged"
                        />
                      </div>
                    </div>

                    <!-- Row 2: Start Time & End Time -->
                    <div class="grid grid-cols-2 gap-2.5">
                      <div class="flex flex-col gap-0.5">
                        <Label class="text-[10px] font-semibold text-surface-500">Start Time</Label>
                        <InputText
                          v-model="editStartTime"
                          type="time"
                          fluid
                          class="!text-xs !py-1 !px-2"
                          data-testid="edit-session-start-time"
                          @change="onEditTimeChanged"
                        />
                      </div>
                      <div class="flex flex-col gap-0.5">
                        <Label class="text-[10px] font-semibold text-surface-500">End Time</Label>
                        <InputText
                          v-model="editEndTime"
                          type="time"
                          fluid
                          class="!text-xs !py-1 !px-2"
                          data-testid="edit-session-end-time"
                          @change="onEditTimeChanged"
                        />
                      </div>
                    </div>

                    <!-- Editable Recorded by Dropdown (When on Shared Board) -->
                    <div v-if="isShared" class="flex flex-col gap-0.5">
                      <Label for="edit-session-recorded-by" class="text-[10px] font-semibold text-surface-500">Recorded by</Label>
                      <Select
                        id="edit-session-recorded-by"
                        v-model="editUserId"
                        :options="members"
                        option-label="display_name"
                        option-value="id"
                        placeholder="Select contributor"
                        fluid
                        class="!text-xs"
                        data-testid="edit-session-recorded-by"
                      >
                        <template #value="slotProps">
                          <div v-if="slotProps.value" class="flex items-center gap-2">
                            <Avatar
                              :label="getUserInitials(getMemberById(slotProps.value))"
                              shape="circle"
                              size="small"
                              class="user-avatar-primary !w-5 !h-5 text-[10px] font-bold"
                            />
                            <span class="text-xs">{{ getMemberName(slotProps.value) }}</span>
                          </div>
                          <span v-else class="text-surface-400 text-xs">Select contributor</span>
                        </template>
                        <template #option="slotProps">
                          <div class="flex items-center gap-2 py-0.5">
                            <Avatar
                              :label="getUserInitials(slotProps.option)"
                              shape="circle"
                              size="small"
                              class="user-avatar-primary !w-5 !h-5 text-[10px] font-bold"
                            />
                            <span class="text-xs">{{ getUserDisplayName(slotProps.option) }}</span>
                          </div>
                        </template>
                      </Select>
                    </div>

                    <!-- Editable Note -->
                    <div class="flex flex-col gap-0.5">
                      <Label class="text-[10px] font-semibold text-surface-500">Note</Label>
                      <InputText
                        v-model="editNoteText"
                        placeholder="Session notes..."
                        fluid
                        class="!text-xs !py-1"
                        data-testid="edit-session-note"
                        @keydown.enter="saveSessionEdits(entry)"
                      />
                    </div>

                    <!-- Edit Action Buttons -->
                    <div class="flex justify-end gap-1.5 pt-1 border-t border-surface-200/80 dark:border-surface-700">
                      <Button
                        label="Cancel"
                        size="small"
                        text
                        severity="secondary"
                        class="!text-xs"
                        @click="editingEntryId = null"
                      />
                      <Button
                        label="Save Changes"
                        icon="pi pi-check"
                        size="small"
                        severity="primary"
                        class="!text-xs"
                        data-testid="btn-save-session-edits"
                        @click="saveSessionEdits(entry)"
                      />
                    </div>
                  </template>
                </Card>
              </template>
            </Card>
          </div>

          <div v-else class="text-xs text-surface-400 italic py-4 text-center">
            No work sessions recorded yet
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, inject, onMounted } from 'vue'
import type { TaskTimerDto, TaskTimeEntryDto, TimerMode } from '~/api/kanban'
import {
  TIMER_MODE_CONFIG,
  TIMER_STATE_CONFIG,
  kanbanApi,
  kanbanContextKey,
} from '~/api/kanban'
import { toCamelCase } from '~/utils/case'
import { useNotifications } from '~/composables/useNotifications'
import { useAuthStore } from '~/stores/auth'
import type { UserOut } from '~/api/friends'
import {
  useTaskTimer,
  formatDigital,
  formatDurationBadge,
  formatTimeRange,
  formatDateLabel,
  getPauseSeconds,
  toLocalTimeString,
  toLocalDateString,
  combineDateAndTime,
} from '~/composables/useTaskTimer'

interface Props {
  timer?: TaskTimerDto | null
  timeEntries?: TaskTimeEntryDto[]
  taskId: string | number
  isShared?: boolean
  boardMembers?: UserOut[]
  currentUserId?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  isShared: undefined,
  boardMembers: undefined,
  currentUserId: undefined,
})

const emit = defineEmits<{
  (e: 'update:timer', timer: TaskTimerDto): void
  (e: 'update:timeEntries', entries: TaskTimeEntryDto[]): void
  (e: 'timerExpired', entry: TaskTimeEntryDto): void
}>()

const kanbanContext = inject(kanbanContextKey, null)
const notify = useNotifications()

let authStore: any
try {
  authStore = useAuthStore()
} catch {
  // Pinia not active
}

const isShared = computed<boolean>(() => {
  if (props.isShared !== undefined) {
    return props.isShared
  }
  return kanbanContext?.isShared?.value ?? false
})

const members = computed<UserOut[]>(() => {
  if (props.boardMembers !== undefined) {
    return props.boardMembers
  }
  return kanbanContext?.boardMembers?.value ?? []
})

const effectiveCurrentUserId = computed<number | string | null>(() => {
  if (props.currentUserId !== undefined) {
    return props.currentUserId
  }
  return authStore?.user?.id ?? null
})

const manualUserId = ref<number | string | null>(null)

watch(
  [effectiveCurrentUserId, members],
  ([userId, mems]) => {
    if (manualUserId.value == null) {
      if (userId != null && mems.some(m => String(m.id) === String(userId))) {
        manualUserId.value = userId
      } else if (userId != null) {
        manualUserId.value = userId
      } else if (mems.length > 0 && mems[0]) {
        manualUserId.value = mems[0].id
      }
    }
  },
  { immediate: true },
)

function getMemberById(id: number | string | null | undefined): UserOut | undefined {
  if (id == null) return undefined
  return members.value.find(m => String(m.id) === String(id))
}

function getMemberName(id: number | string | null | undefined): string {
  const member = getMemberById(id)
  return member ? getUserDisplayName(member) : ''
}

function getUserDisplayName(user?: any): string {
  if (!user) return ''
  return user.displayName || user.display_name || ''
}

function getUserEmail(user?: any): string {
  if (!user) return ''
  return user.email || ''
}

function getUserInitials(user?: any): string {
  const name = getUserDisplayName(user).trim()
  const email = getUserEmail(user).trim()
  if (name) {
    const parts = name.split(/\s+/)
    const first = parts[0]
    const last = parts[parts.length - 1]
    if (parts.length >= 2 && first && last && first[0] && last[0]) {
      return (first[0] + last[0]).toUpperCase()
    }
    if (first) {
      return first.slice(0, 1).toUpperCase()
    }
  }
  if (email) {
    return email.slice(0, 1).toUpperCase()
  }
  return '?'
}

function getUserTooltip(user?: any): string {
  if (!user) return 'Unknown user'
  const name = getUserDisplayName(user).trim()
  const email = getUserEmail(user).trim()
  if (name && email) {
    return `${name} <${email}>`
  }
  if (name) {
    return name
  }
  if (email) {
    return email
  }
  return 'Unknown user'
}

const modeOptions = [
  { label: TIMER_MODE_CONFIG.NONE.label, value: 'NONE' },
  { label: `Stopwatch`, value: 'COUNT_UP' },
  { label: `Countdown`, value: 'COUNT_DOWN' },
]

const localTimer = ref<TaskTimerDto>({
  taskId: props.taskId,
  mode: props.timer?.mode ?? 'NONE',
  targetDurationSeconds: props.timer?.targetDurationSeconds ?? 1500,
  state: props.timer?.state ?? 'IDLE',
  startedAt: props.timer?.startedAt ?? null,
  elapsedSeconds: props.timer?.elapsedSeconds ?? 0,
})

const entries = ref<TaskTimeEntryDto[]>(
  props.timeEntries ? props.timeEntries.map(e => toCamelCase<TaskTimeEntryDto>(e)) : [],
)

const isPersistedTaskId = computed(() => {
  if (!props.taskId) return false
  const str = String(props.taskId)
  return !str.startsWith('draft') && !str.startsWith('new') && !str.startsWith('temp')
})

const loadPersistedEntries = async () => {
  if (!isPersistedTaskId.value) {
    if (!props.timeEntries || props.timeEntries.length === 0) {
      entries.value = []
    }
    return
  }
  try {
    const data = await kanbanApi.listTimeEntries(props.taskId)
    if (data && Array.isArray(data)) {
      const seenIds = new Set<string | number>()
      const deduped: TaskTimeEntryDto[] = []
      for (const item of data) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id)
          deduped.push(item)
        }
      }
      entries.value = deduped
      syncEntriesOut()
    }
  } catch {
    // Fallback gracefully
  }
}

onMounted(() => {
  if (props.timeEntries && props.timeEntries.length > 0) {
    entries.value = props.timeEntries.map(e => toCamelCase<TaskTimeEntryDto>(e))
  } else {
    loadPersistedEntries()
  }
})

watch(
  () => props.taskId,
  (newId) => {
    if (newId) {
      localTimer.value.taskId = newId
      loadPersistedEntries()
    }
  },
  { immediate: true },
)

watch(
  () => props.timer,
  (t) => {
    if (t) localTimer.value = toCamelCase<TaskTimerDto>(t)
  },
  { deep: true },
)

watch(
  () => props.timeEntries,
  (list) => {
    if (list && list.length > 0) {
      entries.value = list.map(e => toCamelCase<TaskTimeEntryDto>(e))
    } else if (list && list.length === 0) {
      entries.value = []
    } else {
      loadPersistedEntries()
    }
  },
  { deep: true },
)

const syncTimerOut = () => emit('update:timer', { ...localTimer.value })
const syncEntriesOut = () => emit('update:timeEntries', [...entries.value])

// Target duration & inline editing
const targetMinutes = computed(() => {
  const target = localTimer.value.targetDurationSeconds ?? 1500
  return Math.floor(target / 60)
})
const customMinutes = ref(targetMinutes.value)

watch(targetMinutes, (m) => {
  customMinutes.value = m
})

// Inline double-click editing on the digital readout
const isEditingTarget = ref(false)
const targetInputText = ref('')
const targetInputRef = ref<any>(null)

const startEditingTarget = () => {
  if (isRunning.value || isPaused.value || localTimer.value.mode !== 'COUNT_DOWN') return
  isEditingTarget.value = true
  targetInputText.value = formatDigital(localTimer.value.targetDurationSeconds || 1500)
  nextTick(() => {
    const el = targetInputRef.value?.$el ?? targetInputRef.value
    if (el?.focus) {
      el.focus()
      el.select?.()
    }
  })
}

const parseTargetDurationString = (input: string): number | null => {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null

  // If format "MM:SS" e.g. "25:00" or "10:30"
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(Number)
    const mins = parts[0] ?? 0
    const secs = parts[1] ?? 0
    const total = mins * 60 + secs
    return total > 0 ? total : null
  }

  // If format "45m" or "45min"
  if (trimmed.endsWith('m') || trimmed.endsWith('min')) {
    const num = parseFloat(trimmed)
    if (!isNaN(num) && num > 0) return Math.round(num * 60)
  }

  // If format "30s" or "30sec"
  if (trimmed.endsWith('s') || trimmed.endsWith('sec')) {
    const num = parseFloat(trimmed)
    if (!isNaN(num) && num > 0) return Math.round(num)
  }

  // If plain number e.g. "35" or "10", treat as minutes
  const val = parseFloat(trimmed)
  if (!isNaN(val) && val > 0) {
    return Math.round(val * 60)
  }

  return null
}

const commitTargetInput = () => {
  if (!isEditingTarget.value) return
  const parsedSeconds = parseTargetDurationString(targetInputText.value)
  if (parsedSeconds && parsedSeconds >= 10 && parsedSeconds <= 720 * 60) {
    localTimer.value.targetDurationSeconds = parsedSeconds
    customMinutes.value = Math.round(parsedSeconds / 60)
    syncTimerOut()
  }
  isEditingTarget.value = false
}

const cancelTargetEditing = () => {
  isEditingTarget.value = false
}

const setPresetMinutes = (m: number) => {
  if (isRunning.value || isPaused.value) return
  localTimer.value.targetDurationSeconds = m * 60
  customMinutes.value = m
  syncTimerOut()
}

const onModeChange = () => {
  if (localTimer.value.mode === 'COUNT_DOWN' && !localTimer.value.targetDurationSeconds) {
    localTimer.value.targetDurationSeconds = 1500
  }
  syncTimerOut()
}

const setMode = (m: TimerMode) => {
  localTimer.value.mode = m
  onModeChange()
}

const totalDurationSeconds = computed(() => {
  return entries.value.reduce((acc, cur) => {
    const dur = Number(cur.durationSeconds ?? 0)
    return acc + (isNaN(dur) ? 0 : dur)
  }, 0)
})

const {
  isRunning,
  isPaused,
  isIdle,
  elapsedSeconds,
  progressPercent,
  displayTime,
} = useTaskTimer(
  () => localTimer.value,
  {
    onExpired: (entry) => {
      handleStop(entry)
      emit('timerExpired', entry)
    },
  },
)

const handleStart = () => {
  const nowIso = new Date().toISOString()
  const isResuming = localTimer.value.state === 'PAUSED' && Boolean(localTimer.value.startedAt)
  if (!isResuming) {
    localTimer.value.startedAt = nowIso
  }
  localTimer.value.lastResumedAt = nowIso
  localTimer.value.lastPausedAt = null
  localTimer.value.state = 'RUNNING'
  syncTimerOut()
  if (kanbanContext?.startTimer && isPersistedTaskId.value) {
    kanbanContext.startTimer(props.taskId, localTimer.value)
  }
}

const handlePause = () => {
  localTimer.value.state = 'PAUSED'
  localTimer.value.elapsedSeconds = elapsedSeconds.value
  localTimer.value.lastResumedAt = null
  localTimer.value.lastPausedAt = new Date().toISOString()
  syncTimerOut()
  if (kanbanContext?.pauseTimer && isPersistedTaskId.value) {
    kanbanContext.pauseTimer(props.taskId)
  }
}

const handleStop = async (entry?: TaskTimeEntryDto) => {
  const duration = elapsedSeconds.value
  const startedAt = localTimer.value.startedAt || new Date(Date.now() - duration * 1000).toISOString()
  const endedAt = (localTimer.value.state === 'PAUSED' && localTimer.value.lastPausedAt)
    ? localTimer.value.lastPausedAt
    : new Date().toISOString()
  const note = localTimer.value.mode === 'COUNT_DOWN' ? 'Completed focus session' : 'Continuous stopwatch session'

  localTimer.value.state = 'IDLE'
  localTimer.value.elapsedSeconds = 0
  localTimer.value.startedAt = null
  localTimer.value.lastResumedAt = null
  localTimer.value.lastPausedAt = null
  syncTimerOut()

  if (kanbanContext?.stopTimer && isPersistedTaskId.value) {
    await kanbanContext.stopTimer(props.taskId, entry)
  } else if (isPersistedTaskId.value) {
    try {
      await kanbanApi.updateTaskTimer(props.taskId, {
        state: 'IDLE',
        startedAt: null,
        lastResumedAt: null,
        lastPausedAt: null,
        elapsedSeconds: 0,
      })
    } catch {
      // Continue
    }
  }

  if (duration > 0) {
    if (isPersistedTaskId.value) {
      await loadPersistedEntries()
    } else {
      const newEntry: TaskTimeEntryDto = {
        id: `entry-${Date.now()}`,
        taskId: props.taskId,
        startedAt,
        endedAt,
        durationSeconds: duration,
        note,
        createdAt: new Date().toISOString(),
      }
      entries.value.unshift(newEntry)
      syncEntriesOut()
    }
  }
}

// -------------------------------------------------------------
// Manual Work Logging State & Handlers
// -------------------------------------------------------------
const isManualLogOpen = ref(false)
const manualDate = ref(toLocalDateString(new Date().toISOString()))
const manualStartTime = ref('09:00')
const manualEndTime = ref('09:25')
const manualDurationMinutes = ref<number | null>(25)
const manualNote = ref('')

const toggleManualLog = () => {
  isManualLogOpen.value = !isManualLogOpen.value
  if (isManualLogOpen.value) {
    const now = new Date()
    const twentyFiveMinsAgo = new Date(now.getTime() - 25 * 60 * 1000)
    manualDate.value = toLocalDateString(twentyFiveMinsAgo.toISOString())
    manualStartTime.value = toLocalTimeString(twentyFiveMinsAgo.toISOString())
    manualEndTime.value = toLocalTimeString(now.toISOString())
    manualDurationMinutes.value = 25
    manualNote.value = ''
    manualUserId.value = effectiveCurrentUserId.value ?? (members.value[0]?.id ?? null)
  }
}

const parseMinutesFromTime = (timeStr: string): number => {
  if (!timeStr) return 0
  const parts = timeStr.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  if (isNaN(h) || isNaN(m)) return 0
  return h * 60 + m
}

const formatMinutesToTime = (totalMinutes: number): string => {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
  const eh = String(Math.floor(normalized / 60)).padStart(2, '0')
  const em = String(normalized % 60).padStart(2, '0')
  return `${eh}:${em}`
}

const onManualTimeInputChanged = () => {
  if (!manualDurationMinutes.value) {
    const startTotalMins = parseMinutesFromTime(manualStartTime.value)
    let endTotalMins = parseMinutesFromTime(manualEndTime.value)
    if (endTotalMins < startTotalMins) {
      endTotalMins += 24 * 60
    }
    manualDurationMinutes.value = Math.max(1, endTotalMins - startTotalMins)
  }
}

const onManualDurationInputChanged = () => {
  // Independent input - no auto-clamping or automatic mutation
}

const submitManualEntry = async () => {
  const durationMins = Number(manualDurationMinutes.value) || 0
  if (durationMins <= 0) {
    notify.error(null, 'Please enter a valid duration')
    return
  }
  const startTotalMins = parseMinutesFromTime(manualStartTime.value)
  let endTotalMins = parseMinutesFromTime(manualEndTime.value)
  if (endTotalMins < startTotalMins) {
    endTotalMins += 24 * 60
  }
  const spanMins = endTotalMins - startTotalMins
  if (durationMins > spanMins) {
    notify.error(null, 'Duration cannot exceed the selected time range')
    return
  }

  const started = combineDateAndTime(manualDate.value, manualStartTime.value)
  let ended = combineDateAndTime(manualDate.value, manualEndTime.value)
  if (endTotalMins >= 24 * 60 || new Date(ended) < new Date(started)) {
    const endedDate = new Date(ended)
    endedDate.setDate(endedDate.getDate() + 1)
    ended = endedDate.toISOString()
  }
  if (new Date(ended) < new Date(started)) {
    notify.error(null, 'End time cannot precede start time')
    return
  }

  const durationSec = durationMins * 60
  const note = manualNote.value.trim() || 'Manual session'

  const selectedUserId = isShared.value ? (manualUserId.value != null ? Number(manualUserId.value) : undefined) : undefined
  const selectedMember = selectedUserId != null ? (getMemberById(selectedUserId) ?? null) : null

  const tempId = `manual-${Date.now()}`
  const newEntry: TaskTimeEntryDto = {
    id: tempId,
    taskId: props.taskId,
    userId: selectedUserId,
    user: selectedMember,
    startedAt: started,
    endedAt: ended,
    durationSeconds: durationSec,
    note,
    createdAt: new Date().toISOString(),
  }

  entries.value.unshift(newEntry)
  syncEntriesOut()
  isManualLogOpen.value = false
  manualNote.value = ''

  if (isPersistedTaskId.value) {
    try {
      const persisted = await kanbanApi.createTimeEntry(props.taskId, {
        userId: selectedUserId,
        startedAt: started,
        endedAt: ended,
        durationSeconds: durationSec,
        note,
      })
      if (persisted && persisted.id) {
        const found = entries.value.find(e => e.id === tempId)
        if (found) {
          Object.assign(found, persisted)
          syncEntriesOut()
        }
      }
    } catch (err) {
      notify.error(err, 'Unable to create time entry')
    }
  }
}

// -------------------------------------------------------------
// Existing Session Editing State & Handlers
// -------------------------------------------------------------
const editingEntryId = ref<string | number | null>(null)
const editDate = ref('')
const editStartTime = ref('')
const editEndTime = ref('')
const editDurationMinutes = ref<number | null>(0)
const editNoteText = ref('')
const editUserId = ref<number | string | null>(null)

const startEditingSession = (entry: TaskTimeEntryDto) => {
  editingEntryId.value = entry.id
  editDate.value = toLocalDateString(entry.startedAt)
  editStartTime.value = toLocalTimeString(entry.startedAt)
  editEndTime.value = toLocalTimeString(entry.endedAt)
  editDurationMinutes.value = Math.max(1, Math.round(entry.durationSeconds / 60))
  editNoteText.value = entry.note
  editUserId.value = entry.userId ?? entry.user?.id ?? effectiveCurrentUserId.value ?? null
}

const onEditTimeChanged = () => {
  // Independent input - no auto-clamping or automatic mutation
}

const onEditDurationChanged = () => {
  // Independent input - no auto-clamping or automatic mutation
}

const saveSessionEdits = async (entry: TaskTimeEntryDto) => {
  const durationMins = Number(editDurationMinutes.value) || 0
  if (durationMins <= 0) {
    notify.error(null, 'Please enter a valid duration')
    return
  }
  const startMins = parseMinutesFromTime(editStartTime.value)
  let endMins = parseMinutesFromTime(editEndTime.value)
  if (endMins < startMins) {
    endMins += 24 * 60
  }
  const spanMins = endMins - startMins
  if (durationMins > spanMins) {
    notify.error(null, 'Duration cannot exceed the session time range')
    return
  }

  const started = combineDateAndTime(editDate.value, editStartTime.value)
  let ended = combineDateAndTime(editDate.value, editEndTime.value)
  if (endMins >= 24 * 60 || new Date(ended) < new Date(started)) {
    const endedDate = new Date(ended)
    endedDate.setDate(endedDate.getDate() + 1)
    ended = endedDate.toISOString()
  }
  if (new Date(ended) < new Date(started)) {
    notify.error(null, 'End time cannot precede start time')
    return
  }

  const durationSec = durationMins * 60
  const note = editNoteText.value

  const selectedUserId = isShared.value ? (editUserId.value != null ? Number(editUserId.value) : undefined) : entry.userId
  const selectedMember = selectedUserId != null ? (getMemberById(selectedUserId) ?? null) : null

  entry.startedAt = started
  entry.endedAt = ended
  entry.durationSeconds = durationSec
  entry.note = note
  if (isShared.value) {
    entry.userId = selectedUserId
    entry.user = selectedMember ?? entry.user
  }
  editingEntryId.value = null
  syncEntriesOut()

  if (isPersistedTaskId.value && !String(entry.id).startsWith('manual') && !String(entry.id).startsWith('entry')) {
    try {
      const updated = await kanbanApi.updateTimeEntry(entry.id, {
        userId: selectedUserId,
        startedAt: started,
        endedAt: ended,
        durationSeconds: durationSec,
        note,
      })
      if (updated) {
        Object.assign(entry, updated)
        syncEntriesOut()
      }
    } catch (err) {
      notify.error(err, 'Unable to update time entry')
    }
  }
}

const deleteEntry = async (id: string | number) => {
  entries.value = entries.value.filter(e => e.id !== id)
  syncEntriesOut()

  if (isPersistedTaskId.value && !String(id).startsWith('manual') && !String(id).startsWith('entry')) {
    try {
      await kanbanApi.deleteTimeEntry(id)
    } catch {
      // Continue
    }
  }
}
</script>

