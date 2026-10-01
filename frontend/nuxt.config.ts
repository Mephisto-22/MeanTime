import Aura from '@primeuix/themes/aura'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: [
    '@primevue/nuxt-module',
    '@nuxtjs/tailwindcss',
  ],
  primevue: {
    options: {
      licenseKey: process.env.PRIMEVUE_LICENSE_KEY || '',
      theme: {
        preset: Aura,
      },
    },
  },
  css: [
    'primeicons/primeicons.css',
    '~/assets/css/main.css',
  ],
  vite: {
    cacheDir: '/tmp/.vite-cache',
    server: {
      watch: {
        usePolling: true,
      },
    },
  },
})
