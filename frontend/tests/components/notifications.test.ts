import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import Toast from 'primevue/toast'
import { describe, expect, it } from 'vitest'
import { useNotifications } from '~/composables/useNotifications'

describe('Global toast notifications', () => {
  it('shows consistent error and success toasts and lets users dismiss errors', async () => {
    const Harness = defineComponent({
      components: { Toast },
      setup() {
        const notify = useNotifications()
        return { fail: () => notify.error(new Error('Save failed'), 'Unable to save'), done: () => notify.success('Board saved.') }
      },
      template: '<div><Toast appendTo="self" /><button id="fail" @click="fail">Fail</button><button id="done" @click="done">Done</button></div>',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrapper = mount(Harness, { attachTo: container, global: { plugins: [PrimeVue, ToastService] } })
    await wrapper.get('#fail').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Unable to save')
    expect(document.body.textContent).toContain('Save failed')
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    const close = document.querySelector<HTMLButtonElement>('.p-toast-close-button')!
    close.click()
    await expect.poll(() => document.body.textContent).not.toContain('Save failed')
    await wrapper.get('#done').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Board saved.')
    wrapper.unmount()
    container.remove()
  })
})
