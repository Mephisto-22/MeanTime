import { computed } from 'vue'
import type { KanbanBoardDto } from '~/api/kanban'
import { useAuthStore } from '~/stores/auth'

export function isBoardOwner(
  board: KanbanBoardDto | null | undefined,
  userId: string | number | null | undefined,
): boolean {
  if (!board) return false
  if (board.isOwner === true) return true

  return userId != null &&
    board.owner?.id != null &&
    String(board.owner.id) === String(userId)
}

export function canEditBoard(
  board: KanbanBoardDto | null | undefined,
  userId: string | number | null | undefined,
): boolean {
  if (!board) return false
  if (isBoardOwner(board, userId)) return true
  if (userId == null) return false

  return board.collaborators?.some(member =>
    String(member.id) === String(userId) &&
    member.role === 'EDITOR',
  ) ?? false
}

export function useBoardPermissions(getBoard: () => KanbanBoardDto | null | undefined) {
  const auth = useAuthStore()

  const isOwner = computed(() => isBoardOwner(getBoard(), auth.user?.id))

  const canEdit = computed(() => canEditBoard(getBoard(), auth.user?.id))

  return { isOwner, canEdit }
}