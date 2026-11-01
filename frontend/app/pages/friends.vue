<template>
  <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <Toast />

    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-surface-900 dark:text-surface-0">
          Friends & Social
        </h1>
        <p class="mt-1 text-surface-600 dark:text-surface-400">
          Manage your friends list, accept pending requests, find new connections, and view blocked users.
        </p>
      </div>
    </div>

    <Tabs
      value="friends"
      data-testid="friends-tabs"
      class="w-full"
    >
      <TabList class="border-b border-surface-200 dark:border-surface-700">
        <Tab
          value="friends"
          data-testid="tab-friends"
          class="flex items-center gap-2"
        >
          <i class="pi pi-users" />
          <span>Friends</span>
          <Badge
            v-if="friends.length > 0"
            :value="friends.length"
            data-testid="friends-count-badge"
          />
        </Tab>

        <Tab
          value="requests"
          data-testid="tab-requests"
          class="flex items-center gap-2"
        >
          <i class="pi pi-inbox" />
          <span>Requests</span>
          <Badge
            v-if="incomingRequests.length > 0"
            :value="incomingRequests.length"
            severity="warn"
            data-testid="incoming-requests-badge"
          />
        </Tab>

        <Tab
          value="search"
          data-testid="tab-search"
          class="flex items-center gap-2"
        >
          <i class="pi pi-user-plus" />
          <span>Add Friend</span>
        </Tab>

        <Tab
          value="blocked"
          data-testid="tab-blocked"
          class="flex items-center gap-2"
        >
          <i class="pi pi-ban" />
          <span>Blocked</span>
          <Badge
            v-if="blockedUsers.length > 0"
            :value="blockedUsers.length"
            severity="secondary"
            data-testid="blocked-count-badge"
          />
        </Tab>
      </TabList>

      <TabPanels class="pt-6">
        <TabPanel value="friends">
          <FriendsList
            :friends="friends"
            :loading="loading"
            @unfriend="handleUnfriend"
            @block="handleBlock"
          />
        </TabPanel>

        <TabPanel value="requests">
          <FriendRequestsList
            :incoming="incomingRequests"
            :outgoing="outgoingRequests"
            :loading="loading"
            @accept="handleAccept"
            @decline="handleDecline"
            @cancel="handleCancel"
            @block="handleBlock"
          />
        </TabPanel>

        <TabPanel value="search">
          <UserSearch
            @send-request="handleSendRequest"
            @accept-request="handleAccept"
            @decline-request="handleDecline"
            @cancel-request="handleCancel"
            @unfriend="handleUnfriend"
            @block="handleBlock"
          />
        </TabPanel>

        <TabPanel value="blocked">
          <BlockedUsersList
            :blocked-users="blockedUsers"
            :loading="loading"
            @unblock="handleUnblock"
          />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Badge from 'primevue/badge'
import Toast from 'primevue/toast'
import FriendsList from '~/components/friends/FriendsList.vue'
import FriendRequestsList from '~/components/friends/FriendRequestsList.vue'
import UserSearch from '~/components/friends/UserSearch.vue'
import BlockedUsersList from '~/components/friends/BlockedUsersList.vue'
import {
  friendsApi,
  type FriendRequestOut,
  type UserOut,
} from '~/api/friends'

definePageMeta({
  middleware: 'auth',
})

const toast = useToast()

const loading = ref(true)
const friends = ref<UserOut[]>([])
const incomingRequests = ref<FriendRequestOut[]>([])
const outgoingRequests = ref<FriendRequestOut[]>([])
const blockedUsers = ref<UserOut[]>([])

async function loadData() {
  loading.value = true
  try {
    const [friendsData, requestsData, blockedData] = await Promise.all([
      friendsApi.getFriends(),
      friendsApi.getRequests(),
      friendsApi.getBlocked(),
    ])
    friends.value = friendsData
    incomingRequests.value = requestsData.incoming
    outgoingRequests.value = requestsData.outgoing
    blockedUsers.value = blockedData
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load friends data'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 3000,
    })
  } finally {
    loading.value = false
  }
}

async function handleUnfriend(userId: number) {
  try {
    await friendsApi.unfriend(userId)
    friends.value = friends.value.filter((f) => f.id !== userId)
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Friend removed successfully',
      life: 3000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to unfriend user'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 3000,
    })
  }
}

async function handleBlock(userId: number) {
  try {
    const target =
      friends.value.find((f) => f.id === userId) ||
      incomingRequests.value.find((r) => r.user.id === userId)?.user ||
      outgoingRequests.value.find((r) => r.user.id === userId)?.user

    await friendsApi.blockUser(userId)

    friends.value = friends.value.filter((f) => f.id !== userId)
    incomingRequests.value = incomingRequests.value.filter((r) => r.user.id !== userId)
    outgoingRequests.value = outgoingRequests.value.filter((r) => r.user.id !== userId)

    if (target && !blockedUsers.value.some((u) => u.id === target.id)) {
      blockedUsers.value.push(target)
    } else if (!target) {
      try {
        const updatedBlocked = await friendsApi.getBlocked()
        blockedUsers.value = updatedBlocked
      } catch {
        // Ignore background refresh failure
      }
    }

    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'User blocked successfully',
      life: 3000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to block user'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 3000,
    })
  }
}

async function handleAccept(userId: number) {
  try {
    const existingReq = incomingRequests.value.find((r) => r.user.id === userId)
    await friendsApi.acceptRequest(userId)
    incomingRequests.value = incomingRequests.value.filter((r) => r.user.id !== userId)

    if (existingReq?.user) {
      if (!friends.value.some((f) => f.id === userId)) {
        friends.value.push(existingReq.user)
      }
    } else {
      try {
        const updatedFriends = await friendsApi.getFriends()
        friends.value = updatedFriends
      } catch {
        // Ignore background refresh failure
      }
    }

    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Friend request accepted',
      life: 3000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to accept friend request'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 3000,
    })
  }
}

async function handleDecline(userId: number) {
  try {
    await friendsApi.declineRequest(userId)
    incomingRequests.value = incomingRequests.value.filter((r) => r.user.id !== userId)
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Friend request declined',
      life: 3000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to decline friend request'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 3000,
    })
  }
}

async function handleCancel(userId: number) {
  try {
    await friendsApi.cancelRequest(userId)
    outgoingRequests.value = outgoingRequests.value.filter((r) => r.user.id !== userId)
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Friend request cancelled',
      life: 3000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to cancel friend request'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 3000,
    })
  }
}

async function handleUnblock(userId: number) {
  try {
    await friendsApi.unblockUser(userId)
    blockedUsers.value = blockedUsers.value.filter((u) => u.id !== userId)
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'User unblocked successfully',
      life: 3000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to unblock user'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 3000,
    })
  }
}

async function handleSendRequest(userId: number) {
  try {
    const newReq = await friendsApi.sendRequest(userId)
    if (newReq && !outgoingRequests.value.some((r) => r.id === newReq.id)) {
      outgoingRequests.value.push(newReq)
    }
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Friend request sent',
      life: 3000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send friend request'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 3000,
    })
  }
}

onMounted(() => {
  loadData()
})
</script>
