import { useAuthStore } from '~/stores/auth'
import { apiService } from '~/services/ApiService'

export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore()
  apiService.setAuthHandler({
    getAccessToken: () => auth.accessToken,
    getSessionRevision: () => auth.sessionRevision,
    refresh: () => auth.refresh(),
    expireSession: () => auth.expireSession(),
  })
  // Middleware initializes before protected navigation; public pages restore too.
  nuxtApp.hook('app:mounted', async () => {
    await auth.initializeSession()
  })
})
