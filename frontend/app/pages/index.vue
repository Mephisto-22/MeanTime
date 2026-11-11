<template>
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
    <section class="overflow-hidden rounded-3xl border border-surface-800 bg-surface-900" aria-labelledby="landing-title">
      <div class="grid items-center gap-12 p-6 sm:p-10 lg:grid-cols-2 lg:p-16">
        <div>
          <p class="mb-5 flex items-center gap-2 text-sm font-semibold text-primary-400">
            <i class="pi pi-clock" aria-hidden="true" /> Make time for what matters
          </p>
          <h1 id="landing-title" class="max-w-xl text-4xl font-bold tracking-tight text-surface-0 sm:text-5xl lg:text-6xl">
            Your tasks. Your time.<br><span class="text-primary-400">One clear workspace.</span>
          </h1>
          <p class="mt-6 max-w-lg text-lg leading-relaxed text-surface-400">
            Bring your plans into focus with MeanTime. Organize tasks on boards,
            track your focus sessions, and keep moving forward with your team.
          </p>
          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <NuxtLink to="/register" class="landing-action bg-primary-500 text-white hover:bg-primary-600" data-testid="landing-register">
              Create an account <i class="pi pi-arrow-right" aria-hidden="true" />
            </NuxtLink>
            <NuxtLink to="/login" class="landing-action border border-surface-700 text-surface-0 hover:bg-surface-800" data-testid="landing-login">
              Log in
            </NuxtLink>
          </div>
        </div>

        <div class="rounded-2xl border border-surface-700 bg-surface-950 p-5 sm:p-6" aria-label="Example task board">
          <div class="mb-6 flex items-center justify-between gap-3">
            <span class="font-semibold text-surface-0">A little progress, every day</span>
            <i class="pi pi-th-large text-surface-500" aria-hidden="true" />
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div v-for="column in preview" :key="column.title" class="rounded-xl border border-surface-800 bg-surface-900 p-3">
              <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-400">{{ column.title }}</p>
              <div class="rounded-lg border border-surface-700 bg-surface-800 p-3">
                <span class="mb-3 block h-1 w-7 rounded-full" :class="column.accent" />
                <p class="text-sm leading-relaxed text-surface-100">{{ column.task }}</p>
              </div>
            </div>
          </div>
          <div class="mt-5 flex items-center gap-3 rounded-xl border border-primary-900 bg-primary-950/40 px-4 py-3 text-sm text-primary-300">
            <i class="pi pi-stopwatch" aria-hidden="true" /> Room for your next focus session
          </div>
          <p class="mt-4 text-xs text-surface-500">An example of your workspace. Your boards start with you.</p>
        </div>
      </div>
    </section>

    <section class="mt-8 grid gap-4 md:grid-cols-3" aria-label="What you can do with MeanTime">
      <article v-for="feature in features" :key="feature.title" class="rounded-2xl border border-surface-800 bg-surface-900 p-6">
        <i :class="feature.icon" class="mb-4 text-xl text-primary-400" aria-hidden="true" />
        <h2 class="text-lg font-semibold text-surface-0">{{ feature.title }}</h2>
        <p class="mt-2 text-sm leading-relaxed text-surface-400">{{ feature.description }}</p>
      </article>
    </section>
    <footer class="mt-10 text-center text-sm text-surface-500">MeanTime · Make your time count.</footer>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

definePageMeta({ public: true })
useSeoMeta({
  title: 'MeanTime — Your tasks. Your time.',
  description: 'Organize your tasks, track focused time, and collaborate with your team in MeanTime.',
})

const auth = useAuthStore()
onMounted(async () => {
  await auth.initializeSession()
  if (auth.isAuthenticated) await navigateTo('/boards', { replace: true })
})

const preview = [
  { title: 'To do', task: 'Plan the next step', accent: 'bg-surface-500' },
  { title: 'In progress', task: 'Make space to focus', accent: 'bg-primary-400' },
  { title: 'Done', task: 'Celebrate progress', accent: 'bg-emerald-400' },
]
const features = [
  { title: 'See the bigger picture', icon: 'pi pi-th-large', description: 'Turn your plans into tasks and move them across boards as your work progresses.' },
  { title: 'Find your focus', icon: 'pi pi-clock', description: 'Track time on your tasks and make room for focused work sessions.' },
  { title: 'Move forward together', icon: 'pi pi-users', description: 'Connect with friends and share boards to keep your team on the same page.' },
]
</script>

<style scoped>
.landing-action {
  @apply inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-400;
}
</style>
