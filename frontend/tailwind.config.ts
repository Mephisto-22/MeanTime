import type { Config } from 'tailwindcss'
import primeui from 'tailwindcss-primeui'

export default <Partial<Config>>{
  content: [
    './app/**/*.{vue,js,ts}',
    './app/components/**/*.{vue,js,ts}',
    './app/layouts/**/*.vue',
    './app/pages/**/*.vue',
    './app/composables/**/*.{js,ts}',
    './app/plugins/**/*.{js,ts}',
    './app/app.{js,ts,vue}',
    './app/error.{js,ts,vue}',
  ],
  plugins: [
    primeui,
  ],
}
