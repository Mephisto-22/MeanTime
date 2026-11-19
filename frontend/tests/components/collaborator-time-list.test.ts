import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CollaboratorTimeDto } from '~/api/analytics'
import CollaboratorTimeList from '~/components/analytics/CollaboratorTimeList.vue'
import { useAuthStore } from '~/stores/auth'

beforeEach(() => {
  useAuthStore().$patch({
    user: {
      id: 1,
      email: 'owner@example.com',
      display_name: 'Owner',
      timezone: 'UTC',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  })
})

function mountList(collaborators: CollaboratorTimeDto[], isShared = true) {
  const totalSeconds = collaborators.reduce((sum, person) => sum + person.totalSeconds, 0)
  return mountSuspended(CollaboratorTimeList, { props: { collaborators, totalSeconds, isShared } })
}

describe('CollaboratorTimeList', () => {
  it('lists each person with their initial, share and time', async () => {
    const wrapper = await mountList([
      { userId: 2, displayName: 'alice', totalSeconds: 5400 },
      { userId: 1, displayName: 'Owner', totalSeconds: 1800 },
      { userId: 3, displayName: 'Bob', totalSeconds: 0 },
    ])

    const rows = wrapper.findAll('[data-testid="collaborator-time-row"]')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.text()).toContain('A')
    expect(rows[0]!.text()).toContain('alice')
    expect(rows[0]!.text()).toContain('75%')
    expect(rows[0]!.text()).toContain('1h 30m')
    expect(rows[2]!.text()).toContain('Bob')
    expect(rows[2]!.text()).toContain('0%')
    expect(wrapper.find('[data-testid="collaborator-time-unshared"]').exists()).toBe(false)
  })

  it('marks the signed-in user', async () => {
    const wrapper = await mountList([
      { userId: 2, displayName: 'Alice', totalSeconds: 60 },
      { userId: 1, displayName: 'Owner', totalSeconds: 60 },
    ])

    const rows = wrapper.findAll('[data-testid="collaborator-time-row"]')
    expect(rows[0]!.text()).not.toContain('(you)')
    expect(rows[1]!.text()).toContain('Owner (you)')
  })

  it('labels each share bar for screen readers', async () => {
    const wrapper = await mountList([{ userId: 1, displayName: 'Owner', totalSeconds: 60 }])

    expect(wrapper.find('[role="progressbar"]').attributes('aria-label')).toBe("Owner: 100% of the board's time")
  })

  it('shows time without a user as Unknown with a generic avatar', async () => {
    const wrapper = await mountList([
      { userId: 1, displayName: 'Owner', totalSeconds: 600 },
      { userId: null, displayName: 'Unknown', totalSeconds: 600 },
    ])

    const unknown = wrapper.findAll('[data-testid="collaborator-time-row"]')[1]!
    expect(unknown.text()).toContain('Unknown')
    expect(unknown.text()).toContain('50%')
    expect(unknown.find('.pi-user').exists()).toBe(true)
  })

  it('shows only the owner and a sharing hint on an unshared board', async () => {
    const wrapper = await mountList([{ userId: 1, displayName: 'Owner', totalSeconds: 900 }], false)

    const rows = wrapper.findAll('[data-testid="collaborator-time-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('100%')
    expect(wrapper.find('[data-testid="collaborator-time-unshared"]').text()).toContain("This board isn't shared")
  })
})
