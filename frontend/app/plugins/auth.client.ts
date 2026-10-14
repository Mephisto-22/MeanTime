import { useAuthStore } from '~/stores/auth'

export default defineNuxtPlugin((nuxtApp) => {
  // Restore after hydration so client markup initially matches the server.
  nuxtApp.hook('app:mounted', async () => {
    await useAuthStore().restoreSession()
  })
})
