<template>
  <Dialog
    v-model:visible="visible"
    modal
    :draggable="false"
    header="New Chat"
    class="dialog-sm"
    style="width: 28rem"
    data-testid="create-chat-dialog"
  >
    <div class="flex flex-col gap-4 py-2">
      <!-- Chat Type Selection -->
      <div class="flex items-center gap-4">
        <div
          class="flex items-center gap-2 cursor-pointer"
          data-testid="chat-type-direct-container"
          @click="chatType = 'DIRECT'"
        >
          <RadioButton
            v-model="chatType"
            inputId="chat-type-direct"
            name="chatType"
            value="DIRECT"
            data-testid="chat-type-direct"
            @click="chatType = 'DIRECT'"
          />
          <label for="chat-type-direct" class="cursor-pointer text-sm font-medium">
            Direct Message
          </label>
        </div>
        <div
          class="flex items-center gap-2 cursor-pointer"
          data-testid="chat-type-group-container"
          @click="chatType = 'GROUP'"
        >
          <RadioButton
            v-model="chatType"
            inputId="chat-type-group"
            name="chatType"
            value="GROUP"
            data-testid="chat-type-group"
            @click="chatType = 'GROUP'"
          />
          <label for="chat-type-group" class="cursor-pointer text-sm font-medium">
            Group Chat
          </label>
        </div>
      </div>

      <!-- Group Title Input (only for GROUP) -->
      <div v-if="chatType === 'GROUP'" class="flex flex-col gap-1">
        <label for="group-title-input" class="text-sm font-medium">Group Title</label>
        <InputText
          id="group-title-input"
          v-model="groupTitle"
          placeholder="e.g. Project Discussion"
          class="w-full"
          size="small"
          data-testid="group-title-input"
        />
      </div>

      <!-- Friend Selection List -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-medium">
          Select {{ chatType === 'DIRECT' ? 'Friend' : 'Participants' }}
        </label>

        <Message
          v-if="displayFriends.length === 0"
          severity="secondary"
          :closable="false"
          size="small"
        >
          No friends available to chat with.
        </Message>

        <ScrollPanel v-else style="max-height: 16rem" class="w-full">
          <div class="flex flex-col gap-1 pr-2">
            <div
              v-for="friend in displayFriends"
              :key="friend.id"
              class="flex items-center justify-between p-2 rounded cursor-pointer transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
              :data-testid="'friend-row-' + friend.id"
              @click="toggleFriend(friend.id)"
            >
              <div class="flex items-center gap-3">
                <Avatar
                  :label="getInitials(friend.display_name)"
                  shape="circle"
                  size="normal"
                />
                <div class="flex flex-col">
                  <span class="text-sm font-medium">{{ friend.display_name }}</span>
                  <span class="text-xs text-surface-500">{{ friend.email }}</span>
                </div>
              </div>

              <RadioButton
                v-if="chatType === 'DIRECT'"
                v-model="selectedFriendId"
                :value="friend.id"
                name="friend-select"
                :inputId="'friend-' + friend.id"
                :data-testid="'friend-radio-' + friend.id"
                @click="selectedFriendId = friend.id"
              />
              <Checkbox
                v-else
                v-model="selectedFriendIds"
                :value="friend.id"
                :inputId="'friend-' + friend.id"
                :data-testid="'friend-checkbox-' + friend.id"
              />
            </div>
          </div>
        </ScrollPanel>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button
          type="button"
          label="Cancel"
          text
          severity="secondary"
          data-testid="cancel-create-chat-button"
          @click="visible = false"
        />
        <Button
          type="button"
          label="Create"
          severity="primary"
          :disabled="isCreateDisabled"
          :loading="loading"
          data-testid="confirm-create-chat-button"
          @click="handleCreate"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { friendsApi, type UserOut } from '~/api/friends'
import type { ConversationDetailOut } from '~/api/chat'
import { useChatStore } from '~/stores/chat'

interface Props {
  friends?: UserOut[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'created', conversation: ConversationDetailOut): void
}>()

const visible = defineModel<boolean>('visible', { default: false })

const chatStore = useChatStore()

const chatType = ref<'DIRECT' | 'GROUP'>('DIRECT')
const groupTitle = ref('')
const selectedFriendId = ref<number | null>(null)
const selectedFriendIds = ref<number[]>([])
const loading = ref(false)
const internalFriends = ref<UserOut[]>([])

const displayFriends = computed<UserOut[]>(() => {
  if (props.friends && props.friends.length > 0) {
    return props.friends
  }
  return internalFriends.value
})

async function fetchFriends(): Promise<void> {
  if (props.friends && props.friends.length > 0) return
  try {
    const list = await friendsApi.getFriends()
    internalFriends.value = list || []
  } catch {
    internalFriends.value = []
  }
}

watch(
  () => visible.value,
  (isOpen) => {
    if (isOpen) {
      fetchFriends()
    } else {
      resetForm()
    }
  },
)

onMounted(() => {
  if (visible.value) {
    fetchFriends()
  }
})

function getInitials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return '?'
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1]
  const firstChar = first[0] ?? ''
  const lastChar = last?.[0] ?? ''
  return (firstChar + lastChar).toUpperCase() || '?'
}

function toggleFriend(id: number) {
  if (chatType.value === 'DIRECT') {
    selectedFriendId.value = id
  } else {
    const idx = selectedFriendIds.value.indexOf(id)
    if (idx === -1) {
      selectedFriendIds.value.push(id)
    } else {
      selectedFriendIds.value.splice(idx, 1)
    }
  }
}

const isCreateDisabled = computed(() => {
  if (loading.value) return true
  if (chatType.value === 'DIRECT') {
    return !selectedFriendId.value
  }
  return !groupTitle.value.trim() || selectedFriendIds.value.length === 0
})

async function handleCreate() {
  if (isCreateDisabled.value) return

  loading.value = true
  try {
    let conv: ConversationDetailOut
    if (chatType.value === 'DIRECT') {
      conv = await chatStore.createChat({
        type: 'DIRECT',
        participant_ids: [selectedFriendId.value!],
      })
    } else {
      conv = await chatStore.createChat({
        type: 'GROUP',
        title: groupTitle.value.trim(),
        participant_ids: selectedFriendIds.value,
      })
    }
    emit('created', conv)
    visible.value = false
    resetForm()
  } finally {
    loading.value = false
  }
}

function resetForm() {
  selectedFriendId.value = null
  selectedFriendIds.value = []
  groupTitle.value = ''
  chatType.value = 'DIRECT'
}
</script>
