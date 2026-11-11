import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LandingPage from '~/pages/index.vue'
import { kanbanApi } from '~/api/kanban'

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, initializeSession: vi.fn() },
  navigate: vi.fn(),
}))
vi.mock('~/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
mockNuxtImport('navigateTo', () => mocks.navigate)

let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.isAuthenticated = false
  mocks.auth.initializeSession.mockResolvedValue(undefined)
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })

describe('Public landing page', () => {
  it('welcomes guests with account links without fetching boards or redirecting', async () => {
    const list = vi.spyOn(kanbanApi, 'listBoards')
    wrapper = await mountSuspended(LandingPage, { route: '/' })
    await flushPromises()
    expect(wrapper.get('h1').text()).toContain('Your tasks. Your time.')
    expect(wrapper.get('[data-testid="landing-login"]').attributes('href')).toBe('/login')
    expect(wrapper.get('[data-testid="landing-register"]').attributes('href')).toBe('/register')
    expect(list).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('waits for session restoration before sending signed-in users to boards', async () => {
    let finish!: () => void
    mocks.auth.initializeSession.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    wrapper = await mountSuspended(LandingPage, { route: '/' })
    expect(mocks.navigate).not.toHaveBeenCalled()
    mocks.auth.isAuthenticated = true
    finish()
    await flushPromises()
    expect(mocks.navigate).toHaveBeenCalledWith('/boards', { replace: true })
  })
})
