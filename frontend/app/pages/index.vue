<template>
  <div class="-my-12 -mx-4 sm:-mx-6 flex flex-col bg-surface-950 text-surface-0">
    <header class="sticky top-0 z-20 border-b border-surface-800 bg-surface-900/90 backdrop-blur-sm px-4 sm:px-6 py-3.5">
      <div class="mx-auto max-w-7xl">
        <Toolbar class="border-none bg-transparent p-0">
          <template #start>
            <NuxtLink
              to="/"
              class="inline-flex items-center text-2xl font-black tracking-tight uppercase text-surface-0 no-underline focus-visible:rounded"
              aria-label="MeanTime home"
            >
              MEAN<span class="text-primary-400">TIME</span>
            </NuxtLink>
          </template>
          <template #end>
            <NuxtLink v-slot="{ href, navigate }" to="/login" custom>
              <Button
                as="a"
                :href="href"
                label="Log in"
                severity="secondary"
                outlined
                data-testid="landing-login"
                @click="navigate"
              />
            </NuxtLink>
          </template>
        </Toolbar>
      </div>
    </header>

    <section
      aria-labelledby="landing-title"
      class="relative overflow-hidden bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.22),transparent_60%)]"
    >
      <div class="mx-auto max-w-7xl px-4 sm:px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div class="lg:col-span-5 flex flex-col items-start gap-6">
          <h1 id="landing-title" class="hero-heading font-extrabold tracking-tight leading-[1.05] text-surface-0">
            YOUR PLANS.
            <span class="block text-primary-400">YOUR TIME.</span>
          </h1>
          <p class="landing-body text-lg text-surface-300 leading-relaxed max-w-[44ch]">
            Side projects, daily routines, and shared ideas. Organize tasks on clear boards and track focused time at your own pace.
          </p>
          <NuxtLink v-slot="{ href, navigate }" to="/register" custom>
            <Button
              as="a"
              :href="href"
              label="Get started"
              icon="pi pi-arrow-right"
              icon-pos="right"
              size="large"
              data-testid="landing-register"
              @click="navigate"
            />
          </NuxtLink>
        </div>

        <figure class="lg:col-span-7 m-0" aria-label="Illustrated example task board. Not live data.">
          <Card class="border border-primary-500/30 bg-surface-900 shadow-2xl shadow-primary-950/40 rounded-2xl">
            <template #title>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <span class="text-lg font-bold text-surface-0">Your Everyday Board</span>
                <Tag value="Board preview" severity="info" />
              </div>
            </template>
            <template #content>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div class="rounded-xl border border-surface-800 bg-surface-950/70 p-3 flex flex-col gap-3">
                  <div class="flex items-center justify-between text-sm font-semibold text-surface-200">
                    <span>Up Next</span>
                    <Tag value="2" severity="secondary" />
                  </div>
                  <LandingTaskSample :task="landingTasks.plan" />
                  <LandingTaskSample :task="landingTasks.hobby" />
                </div>
                <div class="rounded-xl border border-surface-800 bg-surface-950/70 p-3 flex flex-col gap-3">
                  <div class="flex items-center justify-between text-sm font-semibold text-surface-200">
                    <span>In Motion</span>
                    <Tag value="1" severity="info" />
                  </div>
                  <LandingTaskSample :task="landingTasks.focus" />
                </div>
              </div>
            </template>
          </Card>
          <figcaption class="mt-3 text-sm text-surface-400">
            Example workspace preview — no distractions included.
          </figcaption>
        </figure>
      </div>
    </section>

    <section
      id="plan"
      aria-labelledby="plan-title"
      class="border-y border-surface-800 bg-surface-900/40"
    >
      <div class="mx-auto max-w-7xl px-4 sm:px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center" data-reveal>
        <div class="lg:col-span-5 flex flex-col items-start gap-4">
          <h2 id="plan-title" class="section-heading font-extrabold tracking-tight leading-tight text-surface-0">
            Big ideas.
            <span class="block text-primary-400">Clear plan.</span>
          </h2>
          <p class="landing-body text-base sm:text-lg text-surface-300 leading-relaxed">
            Your next project doesn't need another scattered list. Give every task a home, move it across columns, and always see what's next.
          </p>
        </div>

        <div class="lg:col-span-7">
          <Card class="border border-surface-800 bg-surface-900 rounded-2xl">
            <template #title>
              <span class="text-base font-bold text-surface-100">The Next Big Thing</span>
            </template>
            <template #content>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div
                  v-for="column in columns"
                  :key="column.title"
                  class="rounded-xl border border-surface-800 bg-surface-950/70 p-3 flex flex-col gap-2.5 min-w-0"
                >
                  <h3 class="text-sm font-semibold text-surface-200">{{ column.title }}</h3>
                  <LandingTaskSample :task="column.task" />
                </div>
              </div>
            </template>
          </Card>
        </div>
      </div>
    </section>

    <section id="focus" aria-labelledby="focus-title">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center" data-reveal>
        <div class="lg:col-span-6 order-2 lg:order-1">
          <Card class="border border-primary-500/30 bg-surface-900 shadow-xl shadow-primary-950/30 rounded-2xl">
            <template #content>
              <div class="flex flex-col gap-5">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm font-semibold text-surface-300">Active focus session</span>
                  <Tag value="Count Down" severity="info" />
                </div>
                <div
                  class="text-5xl sm:text-6xl font-extrabold tracking-tight text-surface-0 tabular-nums"
                  aria-label="Example timer: 20 minutes remaining"
                >
                  20:00
                </div>
                <div class="h-2 w-full rounded-full bg-surface-800 overflow-hidden" aria-hidden="true">
                  <div class="h-full w-2/3 rounded-full bg-primary-500" />
                </div>
                <LandingTaskSample :task="landingTasks.focus" />
              </div>
            </template>
          </Card>
        </div>

        <div class="lg:col-span-6 order-1 lg:order-2 flex flex-col items-start gap-4">
          <h2 id="focus-title" class="section-heading font-extrabold tracking-tight leading-tight text-surface-0">
            Less spin.
            <span class="block text-primary-400">More flow.</span>
          </h2>
          <p class="landing-body text-base sm:text-lg text-surface-300 leading-relaxed">
            Pick a task and start a timer right from your board. Track count-up or count-down sessions so the work in front of you gets your full attention.
          </p>
        </div>
      </div>
    </section>

    <section
      id="together"
      aria-labelledby="together-title"
      class="border-y border-surface-800 bg-surface-900/40"
    >
      <div class="mx-auto max-w-7xl px-4 sm:px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center" data-reveal>
        <div class="lg:col-span-5 flex flex-col items-start gap-4">
          <h2 id="together-title" class="section-heading font-extrabold tracking-tight leading-tight text-surface-0">
            Your board.
            <span class="block text-primary-400">Your crew.</span>
          </h2>
          <p class="landing-body text-base sm:text-lg text-surface-300 leading-relaxed">
            Bring your collaborators into the picture. Connect with friends, share boards, and keep everyone moving in the same direction.
          </p>
        </div>

        <div class="lg:col-span-7">
          <Card class="border border-primary-500/30 bg-surface-900 shadow-xl shadow-primary-950/30 rounded-2xl">
            <template #title>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <span class="text-base font-bold text-surface-100">Shared Board</span>
                <Tag value="With collaborators" severity="info" />
              </div>
            </template>
            <template #content>
              <div class="flex flex-col gap-4 pt-1">
                <p class="text-sm text-surface-300">
                  Coordinate tasks, priorities, and time entries together in real time.
                </p>
                <div class="rounded-xl border border-surface-800 bg-surface-950/70 p-3">
                  <LandingTaskSample :task="landingTasks.shared" />
                </div>
              </div>
            </template>
          </Card>
        </div>
      </div>
    </section>

    <section id="start" aria-labelledby="start-title" class="px-4 sm:px-6 py-16 lg:py-24">
      <div class="mx-auto max-w-4xl">
        <Card class="border border-primary-500/30 bg-gradient-to-br from-primary-950/60 via-surface-900 to-surface-900 rounded-2xl text-center">
          <template #content>
            <div class="flex flex-col items-center gap-6 py-6 px-4">
              <h2 id="start-title" class="section-heading font-extrabold tracking-tight leading-tight text-surface-0">
                Your plans.
                <span class="text-primary-400">Your pace.</span>
              </h2>
              <p class="landing-body text-base sm:text-lg text-surface-300">
                Make a little room for the projects that matter most.
              </p>
              <NuxtLink v-slot="{ href, navigate }" to="/register" custom>
                <Button
                  as="a"
                  :href="href"
                  label="Create your account"
                  icon="pi pi-arrow-right"
                  icon-pos="right"
                  size="large"
                  @click="navigate"
                />
              </NuxtLink>
            </div>
          </template>
        </Card>
      </div>
    </section>

    <footer class="border-t border-surface-800 bg-surface-950 px-4 sm:px-6 py-8">
      <div class="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <span class="text-lg font-black tracking-tight uppercase text-surface-0">
          MEAN<span class="text-primary-400">TIME</span>
        </span>
        <p class="text-sm text-surface-400 text-center">
          Plan a little. Make time. Stay connected.
        </p>
        <a
          href="#landing-title"
          class="text-sm font-semibold text-primary-400 hover:text-primary-300 no-underline hover:underline"
        >
          Back to top ↑
        </a>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Toolbar from 'primevue/toolbar'
import { useAuthStore } from '~/stores/auth'
import { landingTasks } from '~/data/landingTasks'
import LandingTaskSample from '~/components/LandingTaskSample.vue'

definePageMeta({ public: true, layout: 'headless' })
useSeoMeta({
  title: 'MeanTime — Your plans. Your time.',
  description: 'A home for everyday plans, side projects, and shared ideas. Organize tasks and make time at your own pace with MeanTime.',
})

const auth = useAuthStore()

const columns = [
  { title: 'To Do', task: landingTasks.plan },
  { title: 'In Progress', task: landingTasks.focus },
  { title: 'Done', task: landingTasks.done },
]

onMounted(async () => {
  await auth.initializeSession()
  if (auth.isAuthenticated) {
    await navigateTo('/boards', { replace: true })
  }
})
</script>

<style scoped>
.hero-heading {
  font-size: clamp(2.5rem, 1.5rem + 3.5vw, 4.25rem);
  text-wrap: balance;
}

.section-heading {
  font-size: clamp(1.875rem, 1.25rem + 2vw, 2.75rem);
  text-wrap: balance;
}

.landing-body {
  text-wrap: pretty;
}

a:focus-visible {
  outline: 2px solid var(--p-primary-400);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: no-preference) {
  @supports ((animation-timeline: view()) and (animation-range: entry)) {
    @keyframes section-reveal {
      from {
        opacity: 0.2;
        translate: 0 1.25rem;
      }
      to {
        opacity: 1;
        translate: 0 0;
      }
    }

    [data-reveal] {
      animation: section-reveal auto ease-out both;
      animation-timeline: view();
      animation-range: entry 0% entry 40%;
    }
  }
}
</style>
