# MeanTime Frontend Service

Containerized Vue 3 / Nuxt 4 application styled with PrimeVue 5 (Aura preset) and Tailwind CSS.

## Architecture & Tech Stack

- **Framework**: Nuxt 4 (`^4.5.2`) running on Node 22 (Alpine) with `pnpm`.
- **UI Components**: PrimeVue 5 (`^5.0.2`) with Aura theme preset (`@primeuix/themes`).
- **Icons**: PrimeIcons (`^8.0.2`).
- **Utility Styling**: Tailwind CSS (`~3.4.17`) and `tailwindcss-primeui` (`^0.6.1`).
- **CSS Layering**: Explicit CSS layer ordering (`tailwind-base, primevue, tailwind-utilities`) preventing style conflicts between Tailwind's preflight reset and PrimeVue components.
- **File Watching & HMR**: Vite watcher configured with polling enabled (`usePolling: true`) for reliable autorefresh across Windows host filesystem mounts.
- **Host IDE Independence**: Direct host bind-mount using pnpm's hoisted linker (`nodeLinker: hoisted`), ensuring flat packages and `.nuxt` types are automatically available on the host for IDE autocomplete without requiring `pnpm` installed on the host.

## Directory Structure

```
frontend/
├── app/
│   ├── assets/
│   │   └── css/
│   │       └── main.css         # CSS layers definition for Tailwind & PrimeVue
│   ├── components/
│   │   └── AppCard.vue          # Reusable Card component demonstrating PrimeVue + Tailwind
│   ├── composables/
│   │   └── useTheme.ts          # Theme toggle composable
│   ├── layouts/
│   │   └── default.vue          # Application shell layout (header, footer, navigation)
│   ├── pages/
│   │   └── index.vue            # Interactive homepage showcasing PrimeVue & Tailwind
│   └── app.vue                  # Root Vue application shell
├── docker/
│   ├── Dockerfile               # Production-grade Node 22 Alpine build definition
│   └── entrypoint.sh            # Container initialization and dependency verification script
├── .npmrc                       # Hoisted package configuration
├── nuxt.config.ts               # Nuxt, PrimeVue, and Tailwind configuration
├── package.json                 # Dependency manifest
├── pnpm-workspace.yaml          # Pnpm security and build configuration
├── tailwind.config.ts           # Tailwind CSS theme extension & PrimeUI plugin
└── tsconfig.json                # TypeScript compiler configuration extending Nuxt
```

## Running Locally

Run via Docker Compose at the project root:

```bash
docker compose up frontend --build
```

The application will be accessible at: `http://localhost:3000`.

### Zero-Install Host IDE Autocompletion

No host-level installations of `node`, `pnpm`, or `npm` are required on your developer machine:
- During container startup, dependencies (`node_modules`) and auto-generated types (`.nuxt/tsconfig.json`) are automatically installed and compiled directly onto the host mount using pnpm's hoisted linker.
- Your host IDE (VS Code, WebStorm, Cursor) automatically reads the host `node_modules` and `.nuxt` directories for complete TypeScript intellisense, Vue component resolution, and auto-import support.
- **Do not run `pnpm install` on the host machine**: Running package managers on the host is unnecessary and risks overwriting container Linux binaries with host OS binaries. All dependency management is handled automatically within Docker.
