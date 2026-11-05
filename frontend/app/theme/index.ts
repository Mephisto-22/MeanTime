import Aura from '@primeuix/themes/aura'
import { definePreset } from '@primeuix/themes'

/**
 * MeanTime Custom PrimeVue Theme Preset
 *
 * Visual Identity:
 * - Domain: Engineering-grade time-tracking and Kanban board.
 * - Base Palette:
 *   - Obsidian Canvas Void (#090D16) for dark canvas depth
 *   - Elevated Slate Surface (#0F172A / #1E293B) for headers, cards, and modal panels
 *   - Precision Cobalt Blue (#3B82F6 in dark / #2563EB in light) primary interactive accent
 *   - Active Chronicle Emerald (#10B981) for running timer states
 *   - Cadence Amber (#F59E0B) for pending friend requests and paused timers
 * - Central Semantic Tokens:
 *   - Primary, Surface, Border, Status, Typography, and Navigation
 */
export const MeanTimePreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '2px',
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '12px',
    },
  },
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}',
    },
    typography: {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '0.875rem',
      fontWeight: '400',
      lineHeight: '1.5',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '{slate.50}',
          100: '{slate.100}',
          200: '{slate.200}',
          300: '{slate.300}',
          400: '{slate.400}',
          500: '{slate.500}',
          600: '{slate.600}',
          700: '{slate.700}',
          800: '{slate.800}',
          900: '{slate.900}',
          950: '{slate.950}',
        },
        primary: {
          color: '{primary.600}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        content: {
          background: '{surface.0}',
          hoverBackground: '{surface.100}',
          borderColor: '{surface.200}',
          color: '{text.color}',
          hoverColor: '{text.hover.color}',
        },
        formField: {
          background: '{surface.0}',
          borderColor: '{surface.300}',
          hoverBorderColor: '{surface.400}',
          focusBorderColor: '{primary.color}',
          color: '{surface.700}',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '{slate.50}',
          100: '{slate.100}',
          200: '{slate.200}',
          300: '{slate.300}',
          400: '{slate.400}',
          500: '{slate.500}',
          600: '{slate.600}',
          700: '{slate.700}',
          800: '#1e293b',
          900: '#0f172a',
          950: '#090d16',
        },
        primary: {
          color: '{primary.500}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.400}',
          activeColor: '{primary.600}',
        },
        content: {
          background: '{surface.900}',
          hoverBackground: '{surface.800}',
          borderColor: '#1e293b',
          color: '{text.color}',
          hoverColor: '{text.hover.color}',
        },
        formField: {
          background: '{surface.950}',
          borderColor: '#334155',
          hoverBorderColor: '#475569',
          focusBorderColor: '{primary.color}',
          color: '{surface.0}',
        },
      },
    },
    navigation: {
      item: {
        focusBackground: 'light-dark({surface.100}, {surface.800})',
        activeBackground: 'light-dark({surface.100}, {surface.800})',
        activeColor: '{primary.color}',
        focusColor: '{primary.color}',
      },
    },
  },
  components: {
    button: {
      root: {
        primary: {
          background: '{primary.color}',
          hoverBackground: '{primary.hover.color}',
          activeBackground: '{primary.active.color}',
          borderColor: '{primary.color}',
          hoverBorderColor: '{primary.hover.color}',
          activeBorderColor: '{primary.active.color}',
          color: '{primary.contrast.color}',
          hoverColor: '{primary.contrast.color}',
          activeColor: '{primary.contrast.color}',
          focusRing: {
            color: '{primary.color}',
            shadow: 'none',
          },
        },
      },
    },
    card: {
      root: {
        background: '{content.background}',
        borderRadius: '{border.radius.lg}',
        color: '{content.color}',
      },
    },
    menubar: {
      root: {
        background: '{content.background}',
        borderColor: '{content.border.color}',
        borderRadius: '0',
        color: '{content.color}',
      },
      item: {
        focusBackground: '{navigation.item.focus.background}',
        activeBackground: '{navigation.item.active.background}',
        color: '{navigation.item.color}',
        focusColor: '{navigation.item.focus.color}',
        activeColor: '{navigation.item.active.color}',
      },
    },
    badge: {
      warn: {
        background: 'light-dark({amber.500}, {amber.400})',
        color: 'light-dark({surface.0}, {surface.950})',
      },
      success: {
        background: 'light-dark({emerald.500}, {emerald.400})',
        color: 'light-dark({surface.0}, {surface.950})',
      },
      info: {
        background: 'light-dark({blue.500}, {blue.400})',
        color: 'light-dark({surface.0}, {surface.950})',
      },
    },
    tag: {
      warn: {
        background: 'light-dark({amber.50}, color-mix(in srgb, {amber.400}, transparent 84%))',
        color: 'light-dark({amber.700}, {amber.300})',
      },
      success: {
        background: 'light-dark({emerald.50}, color-mix(in srgb, {emerald.400}, transparent 84%))',
        color: 'light-dark({emerald.700}, {emerald.300})',
      },
      info: {
        background: 'light-dark({blue.50}, color-mix(in srgb, {blue.400}, transparent 84%))',
        color: 'light-dark({blue.700}, {blue.300})',
      },
    },
  },
})

export default {
  preset: MeanTimePreset,
  options: {
    darkModeSelector: '.dark',
    cssLayer: {
      name: 'primevue',
      order: 'tailwind-base, primevue, tailwind-utilities',
    },
  },
}
