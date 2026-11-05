<template>
  <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6 flex flex-col gap-6">
    <div class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold tracking-tight text-surface-900 dark:text-surface-0">
        Friends & Social
      </h1>
      <p class="text-surface-600 dark:text-surface-400">
        Manage your friends list, accept pending requests, find new connections, and view blocked users.
      </p>
    </div>

    <Tabs
      value="friends"
      data-testid="friends-tabs"
      class="w-full"
    >
      <TabList class="border-b border-surface-200 dark:border-surface-800">
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
            ref="userSearchRef"
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
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Badge from 'primevue/badge'
import FriendsList from '~/components/friends/FriendsList.vue'
import FriendRequestsList from '~/components/friends/FriendRequestsList.vue'
import UserSearch from '~/components/friends/UserSearch.vue'
import BlockedUsersList from '~/components/friends/BlockedUsersList.vue'
import {
  friendsApi,
  type FriendRequestOut,
  type UserOut,
} from '~/api/friends'

const notify = useNotifications()
const userSearchRef = ref<InstanceType<typeof UserSearch> | null>(null)

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
    notify.error(err, 'Error')
  } finally {
    loading.value = false
  }
}

async function handleUnfriend(userId: number) {
  try {
    await friendsApi.unfriend(userId)
    userSearchRef.value?.updateStatus(userId, 'none')
    friends.value = friends.value.filter((f) => f.id !== userId)
    notify.success('Friend removed successfully')
  } catch (err: unknown) {
    notify.error(err, 'Error')
  }
}

async function handleBlock(userId: number) {
  try {
    const target =
      friends.value.find((f) => f.id === userId) ||
      incomingRequests.value.find((r) => r.user.id === userId)?.user ||
      outgoingRequests.value.find((r) => r.user.id === userId)?.user

    await friendsApi.blockUser(userId)
    userSearchRef.value?.removeUser(userId)

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

    notify.success('User blocked successfully')
  } catch (err: unknown) {
    notify.error(err, 'Error')
  }
}

async function handleAccept(userId: number) {
  try {
    const existingReq = incomingRequests.value.find((r) => r.user.id === userId)
    await friendsApi.acceptRequest(userId)
    userSearchRef.value?.updateStatus(userId, 'friend')
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

    notify.success('Friend request accepted')
  } catch (err: unknown) {
    notify.error(err, 'Error')
  }
}

async function handleDecline(userId: number) {
  try {
    await friendsApi.declineRequest(userId)
    userSearchRef.value?.updateStatus(userId, 'none')
    incomingRequests.value = incomingRequests.value.filter((r) => r.user.id !== userId)
    notify.success('Friend request declined')
  } catch (err: unknown) {
    notify.error(err, 'Error')
  }
}

async function handleCancel(userId: number) {
  try {
    await friendsApi.cancelRequest(userId)
    userSearchRef.value?.updateStatus(userId, 'none')
    outgoingRequests.value = outgoingRequests.value.filter((r) => r.user.id !== userId)
    notify.success('Friend request cancelled')
  } catch (err: unknown) {
    notify.error(err, 'Error')
  }
}

async function handleUnblock(userId: number) {
  try {
    await friendsApi.unblockUser(userId)
    blockedUsers.value = blockedUsers.value.filter((u) => u.id !== userId)
    notify.success('User unblocked successfully')
  } catch (err: unknown) {
    notify.error(err, 'Error')
  }
}

async function handleSendRequest(userId: number) {
  try {
    const newReq = await friendsApi.sendRequest(userId)
    userSearchRef.value?.updateStatus(userId, 'pending_outgoing')
    if (newReq && !outgoingRequests.value.some((r) => r.id === newReq.id)) {
      outgoingRequests.value.push(newReq)
    }
    notify.success('Friend request sent')
  } catch (err: unknown) {
    notify.error(err, 'Error')
  }
}

onMounted(() => {
  loadData()
})
</script>
