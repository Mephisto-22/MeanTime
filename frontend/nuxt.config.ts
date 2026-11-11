import { MeanTimePreset } from './app/theme/index'

declare module 'primevue/config' {
  interface PrimeVueConfiguration {
    licenseKey?: string
  }
}

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  app: {
    head: {
      title: 'MeanTime',
      htmlAttrs: {
        class: 'dark',
        lang: 'en',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
  modules: [
    '@primevue/nuxt-module',
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
  ],
  routeRules: {
    '/': { ssr: true },
    // Keep login/register pre-rendered/SSR if desired, or set ssr: false for protected routes
    '/login': { ssr: true },
    '/register': { ssr: true },
    '/forgot-password': { ssr: true },
    '/reset-password': { ssr: true },
    '/**': { ssr: false } // SPA mode for the dashboard
  },
  nitro: {
    routeRules: {
      '/api/**': {
        proxy: {
          to: `${process.env.BACKEND_INTERNAL_URL}/api/**`,
          // Pass the backend's redirects (such as to Google's sign-in page) to
          // the browser instead of following them on the server.
          fetchOptions: { redirect: 'manual' },
        },
      },
    },
  },
  primevue: {
    importTheme: {
      from: '~/theme',
      as: 'MeanTimeTheme',
    },
    options: {
      licenseKey: process.env.PRIMEVUE_LICENSE_KEY || '',
      theme: {
        preset: MeanTimePreset,
        options: {
          darkModeSelector: '.dark',
          cssLayer: {
            name: 'primevue',
            order: 'tailwind-base, primevue, tailwind-utilities',
          },
        },
      },
    },
    components: {
      exclude: [
        // Heavy data grids & hierarchical trees (OrderList, VirtualScroller, TreeSelect kept available)
        'DataTable',
        'Column',
        'ColumnGroup',
        'Row',
        'TreeTable',
        'Tree',
        'Paginator',
        'PickList',
        'OrganizationChart',

        // Media studios & heavy visual viewers
        'Gallery',
        'GalleryBackdrop',
        'GalleryContent',
        'GalleryDownload',
        'GalleryFlipX',
        'GalleryFlipY',
        'GalleryFooter',
        'GalleryFullScreen',
        'GalleryHeader',
        'GalleryItem',
        'GalleryNext',
        'GalleryPrev',
        'GalleryRotateLeft',
        'GalleryRotateRight',
        'GalleryThumbnail',
        'GalleryThumbnailContent',
        'GalleryThumbnailItem',
        'GalleryZoomIn',
        'GalleryZoomOut',
        'GalleryZoomToggle',
        'Galleria',
        'Carousel',
        'CarouselContent',
        'CarouselIndicator',
        'CarouselIndicators',
        'CarouselItem',
        'CarouselNext',
        'CarouselPrev',
        'ImageCompare',
        'Compare',
        'CompareHandle',
        'CompareIndicator',
        'CompareItem',

        // Niche & specialized widgets (FileUpload kept available)
        'Terminal',
        'Dock',
        'ColorPicker',
        'InputColor',
        'InputColorArea',
        'InputColorAreaBackground',
        'InputColorAreaHandle',
        'InputColorEyeDropper',
        'InputColorInput',
        'InputColorSlider',
        'InputColorSliderHandle',
        'InputColorSliderTrack',
        'InputColorSwatch',
        'InputColorSwatchBackground',
        'InputColorTransparencyGrid',
        'Knob',
        'Rating',
        'SpeedDial',
        'Splitter',
        'SplitterPanel',
        'CascadeSelect',
        'Editor',
        'Chart',
      ],
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
        ignored: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/.git/**'],
      },
    },
  },
})
