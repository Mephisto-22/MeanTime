import Aura from '@primeuix/themes/aura'

declare module 'primevue/config' {
  interface PrimeVueConfiguration {
    licenseKey?: string
  }
}

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: [
    '@primevue/nuxt-module',
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
  ],
  nitro: {
    routeRules: {
      '/api/**': {
        proxy: `${process.env.BACKEND_INTERNAL_URL}/api/**`,
      },
    },
  },
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
