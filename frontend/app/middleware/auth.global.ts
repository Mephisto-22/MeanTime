import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async (to) => {
  // Tokens live in browser storage. Protected page content is client-only so
  // neither its markup nor its setup/data requests execute on the server.
  if (import.meta.server) return
  const auth = useAuthStore()
  await auth.initializeSession()
  if (to.meta.public === true) return
  if (!auth.isAuthenticated) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } }, { replace: true })
  }
})
