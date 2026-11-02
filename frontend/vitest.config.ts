import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        domEnvironment: 'happy-dom',
      },
    },
    hookTimeout: 60000,
    testTimeout: 30000,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/smoke/**', '**/node_modules/**'],
    passWithNoTests: true,
  },
})
