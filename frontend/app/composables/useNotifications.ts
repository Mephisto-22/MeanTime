import { useToast } from 'primevue/usetoast'
import { getErrorMessage } from '~/utils/errors'

export function useNotifications() {
  const toast = useToast()
  return {
    error(error: unknown, summary = 'Something went wrong') {
      // Errors remain available until dismissed, including after navigation.
      toast.add({ severity: 'error', summary, detail: getErrorMessage(error), closable: true })
    },
    success(detail: string) {
      toast.add({ severity: 'success', summary: 'Success', detail, life: 4000 })
    },
  }
}
