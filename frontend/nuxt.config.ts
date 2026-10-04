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
