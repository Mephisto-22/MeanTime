import { computed } from 'vue'
import type { KanbanBoardDto } from '~/api/kanban'
import { useAuthStore } from '~/stores/auth'

export function useBoardPermissions(getBoard: () => KanbanBoardDto | null | undefined) {
  const auth = useAuthStore()

  const isOwner = computed(() => {
    const board = getBoard()
    if (!board) return false
    if (board.isOwner === true) return true

    return auth.user?.id != null &&
      board.owner?.id != null &&
      String(board.owner.id) === String(auth.user.id)
  })

  const canEdit = computed(() => {
    const board = getBoard()
    if (!board) return false
    if (isOwner.value) return true
    if (auth.user?.id == null) return false

    return board.collaborators?.some(member =>
      String(member.id) === String(auth.user!.id) &&
      member.role === 'EDITOR',
    ) ?? false
  })

  return { isOwner, canEdit }
}