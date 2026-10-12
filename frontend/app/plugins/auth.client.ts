import { useAuthStore } from '~/stores/useAuthStore'

export default defineNuxtPlugin((nuxtApp) => {
  // Restore after hydration so client markup initially matches the server.
  nuxtApp.hook('app:mounted', () => {
    useAuthStore().restoreSession()
  })
})
