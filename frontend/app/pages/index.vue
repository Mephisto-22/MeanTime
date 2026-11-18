<template>
  <div ref="landing" class="takeover" :class="{ 'motion-on': motionEnabled }">
    <Toolbar class="takeover-nav" aria-label="Welcome navigation">
      <template #start><NuxtLink to="/" class="brand" aria-label="MeanTime home">MEAN<span>TIME</span></NuxtLink></template>
      <template #end>
        <Button :icon="motionEnabled ? 'pi pi-pause' : 'pi pi-play'" :aria-label="motionEnabled ? 'Pause decorative motion' : 'Resume decorative motion'" :disabled="reducedMotion" class="motion-toggle" @click="toggleMotion" />
        <a href="#features" class="nav-features">EXPLORE <span aria-hidden="true">↘</span></a>
        <NuxtLink v-slot="{ href, navigate }" to="/login" custom><Button as="a" :href="href" label="LOG IN" class="cut-button login-button" data-testid="landing-login" @click="navigate" /></NuxtLink>
      </template>
    </Toolbar>

    <section class="takeover-hero" data-animate aria-labelledby="landing-title">
      <div class="hero-copy">
        <p class="issue-label"><span>A LITTLE SPACE FOR YOU.</span> AT YOUR OWN PACE.</p>
        <h1 id="landing-title"><span class="title-one">YOUR PLANS.</span><span class="title-two">YOUR TIME.</span></h1>
        <p class="hero-description">Side projects. Everyday plans.<br>A place to bring it all together.</p>
        <NuxtLink v-slot="{ href, navigate }" to="/register" custom><Button as="a" :href="href" label="GET STARTED" icon="pi pi-arrow-up-right" icon-pos="right" class="cut-button start-button" data-testid="landing-register" @click="navigate" /></NuxtLink>

      </div>
      <figure class="hero-art" aria-label="Illustrated example task board. Not live data.">
        <Card class="preview-board">
          <template #title><span class="board-title">YOUR EVERYDAY BOARD <i class="pi pi-bolt" aria-hidden="true" /></span></template>
          <template #content>
            <p class="board-caption">A FEW THINGS / ONE PLACE</p>
            <div class="board-columns">
              <section><h2>UP NEXT <span>02</span></h2><LandingTaskSample :task="landingTasks.plan" class="hero-task" /><LandingTaskSample :task="landingTasks.hobby" class="hero-task" /></section>
              <section><h2>IN MOTION <span>01</span></h2><LandingTaskSample :task="landingTasks.focus" class="hero-task" /></section>
            </div>
          </template>
        </Card>
        <figcaption>WORKSPACE PREVIEW / NO DISTRACTIONS INCLUDED</figcaption>
      </figure>
      <a class="scroll-cue" href="#features"><span>SCROLL TO EXPLORE</span><span aria-hidden="true">↓↓</span></a>
    </section>
    <p class="quiet-divider">A little planning. More room for everything else.</p>

    <div id="features" class="feature-story">
      <section id="plan" class="feature-chapter chapter-plan" data-animate aria-labelledby="plan-title">
        <div class="chapter-copy" data-reveal><p class="chapter-index">01 / GET IT OUT OF YOUR HEAD</p><h2 id="plan-title">BIG IDEAS.<br><span>CLEAR PLAN.</span></h2><p>Your next project doesn't need another scattered list. Give every task a home, move it across your board, and see what's next.</p><a href="#focus" class="chapter-link">NEXT: FIND YOUR FOCUS <span aria-hidden="true">↘</span></a></div>
        <Card class="plan-demo chapter-demo" data-reveal>
          <template #title><span class="demo-kicker">PROJECT / THE NEXT BIG THING</span></template>
          <template #content><div class="plan-lanes"><section v-for="lane in lanes" :key="lane.title"><h3>{{ lane.title }}</h3><LandingTaskSample :task="lane.task" class="plan-task" /></section></div><p class="demo-note">EXAMPLE BOARD · A PLACE FOR EVERY NEXT STEP</p></template>
        </Card>
      </section>

      <section id="focus" class="feature-chapter chapter-focus" data-animate aria-labelledby="focus-title">
        <div class="chapter-copy" data-reveal><p class="chapter-index">02 / CUT THROUGH THE NOISE</p><h2 id="focus-title">LESS SPIN.<br><span>MORE FLOW.</span></h2><p>Pick a task. Start a session. Track the time you spend doing the work, so the next step gets your full attention.</p><a href="#together" class="chapter-link">NEXT: BRING YOUR PEOPLE <span aria-hidden="true">↘</span></a></div>
        <Card class="focus-demo chapter-demo" data-reveal><template #content><p class="demo-kicker">A MOMENT / JUST FOR THIS</p><div class="big-timer" aria-label="Example timer: 20 minutes remaining">20<span>:</span>00</div><div class="timer-rule" aria-hidden="true"><span /></div><LandingTaskSample :task="landingTasks.focus" class="focus-task-preview" /><Tag value="EXAMPLE FOCUS SESSION" /></template></Card>
      </section>

      <section id="together" class="feature-chapter chapter-together" data-animate aria-labelledby="together-title">
        <div class="chapter-copy" data-reveal><p class="chapter-index">03 / BETTER TOGETHER</p><h2 id="together-title">YOUR BOARD.<br><span>YOUR CREW.</span></h2><p>Bring your people into the picture. Connect with friends, share boards, and keep the whole team moving in the same direction.</p><a href="#start" class="chapter-link">READY WHEN YOU ARE <span aria-hidden="true">↘</span></a></div>
        <Card class="crew-demo chapter-demo" data-reveal><template #content><p class="demo-kicker">SAME BOARD. YOUR PEOPLE.</p><p>A little help from your friends.</p><LandingTaskSample :task="landingTasks.shared" class="shared-task-preview" /><Tag value="ILLUSTRATED TEAM WORKSPACE" /></template></Card>
      </section>
    </div>

    <section id="start" class="final-call" data-animate aria-labelledby="start-title"><p class="chapter-index">MAKE A LITTLE ROOM FOR YOU.</p><h2 id="start-title">YOUR PLANS.<br>YOUR <span>PACE.</span></h2><NuxtLink v-slot="{ href, navigate }" to="/register" custom><Button as="a" :href="href" label="CREATE YOUR ACCOUNT" icon="pi pi-arrow-up-right" icon-pos="right" class="cut-button start-button" @click="navigate" /></NuxtLink></section>
    <footer class="takeover-footer"><span class="brand">MEANTIME</span><p>PLAN A LITTLE. MAKE TIME. STAY CONNECTED.</p><a href="#landing-title">BACK TO TOP ↑</a></footer>
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
useSeoMeta({ title: 'MeanTime — Your plans. Your time.', description: 'A home for everyday plans, side projects, and shared ideas. Organize tasks and make time at your own pace with MeanTime.' })
const auth = useAuthStore()
const landing = ref<HTMLElement | null>(null)
const motionEnabled = ref(false)
const manuallyPaused = ref(false)
const reducedMotion = ref(false)
let observer: IntersectionObserver | undefined
let motionQuery: MediaQueryList | undefined
const lanes = [
  { title: 'TO DO', task: landingTasks.plan },
  { title: 'IN PROGRESS', task: landingTasks.focus },
  { title: 'DONE', task: landingTasks.done },
]

function configureMotion() {
  reducedMotion.value = motionQuery?.matches ?? false
  motionEnabled.value = !reducedMotion.value && !manuallyPaused.value && typeof IntersectionObserver !== 'undefined'
}
function toggleMotion() {
  manuallyPaused.value = !manuallyPaused.value
  configureMotion()
}
onMounted(async () => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-active', entry.isIntersecting)
        if (entry.isIntersecting) entry.target.classList.add('is-visible')
      })
    }, { threshold: .15 })
    landing.value?.querySelectorAll('[data-reveal], [data-animate]').forEach(element => observer?.observe(element))
  }
  configureMotion()
  motionQuery.addEventListener('change', configureMotion)
  await auth.initializeSession()
  if (auth.isAuthenticated) await navigateTo('/boards', { replace: true })
})
onBeforeUnmount(() => {
  observer?.disconnect()
  motionQuery?.removeEventListener('change', configureMotion)
})
</script>

<style scoped>
.takeover { --electric: var(--p-primary-color, #3b82f6); --accent: var(--p-primary-hover-color, #60a5fa); --white: var(--p-text-color, #ffffff); --black: var(--p-surface-950, #09090b); --panel: var(--p-content-background, #18181b); --border: var(--p-content-border-color, #27272a); --card-radius: var(--p-card-border-radius, 8px); --button-radius: var(--p-button-border-radius, 6px); color: var(--white); background: var(--black); width: calc(100% + 2rem); margin: -3rem -1rem; overflow: clip; font-family: Arial, Helvetica, sans-serif; }
.takeover-nav { position: relative; z-index: 5; margin: 0; padding: 25px 5%; background: var(--black); color: var(--white); border: 0; border-radius: 0; }
.brand { display: inline-flex; align-items: center; font-family: 'Arial Black', Arial, sans-serif; font-size: 29px; font-style: normal; letter-spacing: -1px; color: var(--white); text-decoration: none; }
.brand span { color: var(--accent); }
.brand b { font-size: 30px; margin-left: 7px; transform: rotate(-15deg); }
.takeover-nav :deep(.p-toolbar-end) { gap: 30px; }
.motion-toggle { background: transparent; color: white; border: 1px solid #ffffff55; border-radius: 0; width: 34px; height: 34px; }
.motion-toggle:hover { background: #ffffff22; border-color: white; color: white; }
.nav-features, .chapter-link, .takeover-footer a { color: inherit; text-decoration: none; font-size: 11px; font-weight: 900; letter-spacing: 1px; }
.nav-features span { margin-left: 10px; font-size: 20px; }
.cut-button { border-radius: 0; border: 0; font-weight: 900; font-style: normal; letter-spacing: .5px; transform: skew(-8deg) rotate(-2deg); box-shadow: 5px 5px 0 var(--white); transition: transform .15s, box-shadow .15s; }
.cut-button :deep(.p-button-label), .cut-button :deep(.p-button-icon) { transform: skew(8deg); }
.login-button { color: var(--black); background: var(--white); padding: 10px 23px; box-shadow: 4px 4px 0 var(--electric); }
.login-button:hover { color: var(--black); background: var(--electric); box-shadow: 4px 4px 0 white; }
.takeover-hero { position: relative; display: grid; grid-template-columns: 1.05fr 1fr; align-items: center; gap: 20px; min-height: 760px; padding: 65px 7% 110px; background: var(--electric); color: var(--black); isolation: isolate; }
.takeover-hero::before { content: ''; position: absolute; inset: 0; opacity: .17; z-index: -1; background-image: radial-gradient(#08080b 1.3px, transparent 1.3px); background-size: 8px 8px; mask-image: linear-gradient(125deg, transparent 30%, black); }
.takeover-hero::after { content: ''; position: absolute; bottom: -1px; left: 0; width: 100%; height: 65px; background: var(--black); clip-path: polygon(0 75%, 69% 0, 100% 60%, 100% 100%, 0 100%); }
.hero-ghost { position: absolute; right: -60px; top: 0; font-family: 'Arial Black', Arial, sans-serif; font-size: 370px; font-style: normal; color: #ffffff0d; pointer-events: none; transform: translateX(calc(var(--scroll-shift) * -1)) rotate(-12deg); z-index: -1; }
.hero-copy { position: relative; z-index: 2; }
.issue-label { font-family: 'Courier New', monospace; font-size: 10px; font-weight: 900; letter-spacing: 1px; margin-bottom: 28px; transform: rotate(-3deg); }
.issue-label span { display: inline-block; color: var(--black); background: var(--white); padding: 7px 9px; margin-right: 7px; }
h1 { display: flex; flex-direction: column; align-items: flex-start; font-family: 'Arial Black', Arial, sans-serif; font-style: normal; font-weight: 900; font-size: clamp(48px, 5vw, 72px); letter-spacing: -3px; line-height: 1.04; }
h1 span { display: block; white-space: nowrap; padding: 0 12px 7px; }
.title-one { color: var(--white); background: var(--black); transform: rotate(-5deg) skew(-5deg); }
.title-two { color: var(--black); background: var(--white); transform: rotate(-3deg) skew(-5deg); margin-top: 4px; box-shadow: 8px 8px 0 var(--black); }
.hero-description { font-size: 18px; line-height: 1.5; font-weight: 600; margin: 35px 0 25px 6px; }
.start-button { color: var(--white); background: var(--black); padding: 18px 28px; gap: 22px; font-size: 15px; }
.start-button:hover { color: var(--black); background: var(--white); transform: skew(-8deg) rotate(1deg) translateY(-3px); box-shadow: 6px 6px 0 var(--black); }
.under-cta { margin: 20px 0 0 3px; font-family: 'Courier New', monospace; font-size: 9px; letter-spacing: 1px; font-weight: 700; }
.hero-art { position: relative; height: 490px; min-width: 0; margin: 0; transform: translateY(calc(var(--scroll-shift) * -.3)); }
.burst { position: absolute; top: -95px; right: -55px; font-size: 430px; color: var(--black); line-height: 1; transform: rotate(15deg); z-index: 0; }
.preview-board { position: absolute; top: 45px; left: 0; width: 95%; background: var(--black); color: var(--white); border-radius: 0; border: 5px solid var(--white); transform: rotate(8deg); box-shadow: 12px 12px 0 var(--black); }
.preview-board > :deep(.p-card-body) { padding: 18px; gap: 0; }
.board-title { display: flex; justify-content: space-between; align-items: center; font-family: 'Arial Black', Arial, sans-serif; font-size: 27px; font-style: normal; }
.board-caption { margin: 5px 0 20px; font-family: 'Courier New', monospace; font-size: 8px; letter-spacing: .7px; }
.board-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.board-columns section { min-width: 0; }
.board-columns h2 { display: flex; justify-content: space-between; font-size: 9px; font-weight: 800; margin-bottom: 12px; }
.board-columns h2 span { color: #91a8ff; }
.hero-task { margin-bottom: 12px; }
.focus-task-preview, .shared-task-preview { margin: 24px 0; }
.board-check { display: block; text-align: center; font-size: 72px; line-height: 1; font-weight: 900; transform: rotate(-12deg); }
.time-ticket { position: absolute; bottom: -10px; right: -10px; width: 225px; padding: 14px 25px; background: var(--white); color: var(--black); border: 4px solid var(--black); box-shadow: 7px 7px 0 var(--white); transform: rotate(-12deg); }
.time-ticket span { display: block; font-family: 'Courier New', monospace; font-size: 9px; font-weight: 900; letter-spacing: 1px; }
.time-ticket strong { display: block; font-family: 'Arial Black', Arial, sans-serif; font-style: normal; font-size: 62px; line-height: 1.1; }
.hero-art figcaption { position: absolute; left: 0; bottom: -45px; font-family: 'Courier New', monospace; font-size: 8px; font-weight: 700; }
.scroll-cue { position: absolute; bottom: 60px; left: 7%; display: flex; align-items: center; gap: 20px; color: var(--black); font-size: 9px; font-weight: 900; letter-spacing: 2px; text-decoration: none; z-index: 3; }
.scroll-cue span:last-child { font-size: 27px; }
.ticker { overflow: hidden; padding: 18px 0; border-block: 2px solid white; transform: rotate(-2deg) scale(1.02); background: var(--black); position: relative; z-index: 2; }
.ticker-track { display: flex; width: max-content; }
.ticker-track span { white-space: nowrap; font-family: 'Arial Black', Arial, sans-serif; font-size: 36px; font-style: normal; padding-right: 20px; }
.ticker b { color: #91a8ff; font-weight: inherit; }
.feature-story { position: relative; }
.feature-chapter { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 9%; align-items: center; min-height: 780px; padding: 130px 9%; isolation: isolate; scroll-margin-top: 30px; }
.chapter-ghost { position: absolute; top: 20px; right: -30px; font-family: 'Arial Black', Arial, sans-serif; font-style: normal; font-size: clamp(150px, 25vw, 360px); color: #ffffff06; z-index: -1; pointer-events: none; transform: rotate(-8deg); }
.chapter-index { font-family: 'Courier New', monospace; font-size: 11px; letter-spacing: 1px; font-weight: 700; margin-bottom: 25px; }
.chapter-copy h2 { font-family: 'Arial Black', Arial, sans-serif; font-style: normal; font-size: clamp(48px, 5.3vw, 78px); letter-spacing: -1px; line-height: 1.05; }
.chapter-copy h2 span { display: inline-block; background: var(--white); color: var(--black); padding: 0 10px 4px; transform: rotate(-3deg); margin: 7px 0 0 -7px; }
.chapter-copy > p:not(.chapter-index) { max-width: 370px; color: #c1c1cb; font-size: 16px; line-height: 1.8; margin: 28px 0; }
.chapter-link { display: inline-flex; align-items: center; gap: 15px; padding-bottom: 8px; border-bottom: 2px solid #91a8ff; }
.chapter-demo { border-radius: 0; border: 3px solid var(--white); background: #17171d; color: white; box-shadow: 12px 12px 0 var(--electric); transform: rotate(4deg); }
.chapter-demo > :deep(.p-card-body) { padding: 25px; }
.demo-kicker { font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; }
.plan-lanes { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 25px; }
.plan-lanes section { min-width: 0; }
.plan-lanes h3 { font-size: 8px; margin-bottom: 12px; font-weight: 900; }
.demo-note { font-family: 'Courier New', monospace; font-size: 8px; color: #b2b2c1; margin-top: 30px; }
.chapter-focus { background: var(--electric); clip-path: polygon(0 4%, 100% 0, 100% 96%, 0 100%); }
.chapter-focus .chapter-copy { color: var(--black); }
.chapter-focus .chapter-copy > p { color: var(--black); }
.chapter-focus .chapter-ghost { color: #00000010; }
.chapter-focus .chapter-link { border-color: var(--black); }
.chapter-focus .chapter-demo { grid-column: 1; grid-row: 1; }
.chapter-focus .chapter-copy { grid-column: 2; grid-row: 1; }
.focus-demo { background: var(--white); color: var(--black); border-color: var(--black); box-shadow: -12px 12px 0 var(--black); transform: rotate(-5deg); text-align: center; }
.focus-demo > :deep(.p-card-body) { padding: 38px 25px; }
.big-timer { font-family: 'Arial Black', Arial, sans-serif; font-size: clamp(65px, 8vw, 120px); font-style: normal; letter-spacing: -4px; margin: 25px 0; line-height: 1; }
.big-timer span { color: #345ba4; }
.timer-rule { height: 11px; background: #d7d7df; transform: skew(-15deg); }
.timer-rule span { display: block; width: 64%; height: 100%; background: var(--electric); }
.focus-task { font-weight: 900; font-size: 11px; margin: 25px 0; }
.chapter-demo :deep(.p-tag) { border-radius: 0; font-size: 8px; color: white; background: var(--black); }
.crew-demo { color: var(--black); background: var(--electric); transform: rotate(5deg); box-shadow: 12px 12px 0 var(--white); border-color: var(--black); }
.crew-symbols { display: flex; align-items: center; justify-content: center; margin: 40px 0; }
.crew-symbols span { display: grid; place-items: center; background: var(--white); color: var(--black); font-size: 50px; width: 95px; height: 95px; border: 4px solid var(--black); transform: rotate(-15deg); margin-right: -8px; }
.crew-symbols span:nth-child(2) { background: var(--black); color: white; transform: rotate(10deg) translateY(-13px); }
.crew-symbols span:last-child { transform: rotate(-6deg); }
.crew-demo h3 { font-family: 'Arial Black', Arial, sans-serif; font-size: 65px; line-height: .95; font-style: normal; }
.crew-demo p:not(.demo-kicker) { margin: 20px 0; font-size: 13px; }
.final-call { padding: 100px 7% 120px; background: var(--white); color: var(--black); text-align: center; clip-path: polygon(0 4%, 100% 0, 100% 100%, 0 100%); }
.final-call h2 { font-family: 'Arial Black', Arial, sans-serif; font-size: clamp(58px, 8vw, 110px); font-style: normal; line-height: .98; letter-spacing: -2px; margin-bottom: 35px; }
.final-call h2 span { color: #345ba4; }
.final-call .start-button { box-shadow: 6px 6px 0 var(--electric); }
.takeover-footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 30px 5%; }
.takeover-footer .brand { font-size: 21px; }
.takeover-footer p { font-family: 'Courier New', monospace; font-size: 9px; color: #b2b2bf; }
.takeover a:focus-visible { outline: 3px dashed #ffe568; outline-offset: 9px; }
/* Use the same surfaces, blue accents, corners, and borders as the product UI. */
.quiet-divider { width: 100%; max-width: none; margin: 0; padding: 23px 7%; background: var(--white); color: var(--black); text-align: center; font-size: 14px; font-weight: 600; }
.takeover-hero { min-height: 680px; }
.hero-art { transform: none; }
.feature-chapter { min-height: 650px; padding-block: 90px; }

h1 { font-weight: 800; }
.chapter-copy h2 { font-size: clamp(38px, 4.5vw, 60px); }
.final-call h2 { font-size: clamp(45px, 6vw, 76px); }
.focus-demo .focus-task-preview { margin: 25px 0; }
.crew-demo .shared-task-preview { margin: 25px 0; }
.cut-button, .motion-toggle { border-radius: var(--button-radius); transform: none; box-shadow: none; }
.cut-button :deep(.p-button-label), .cut-button :deep(.p-button-icon) { transform: none; }
.login-button { background: var(--panel); color: var(--white); border: 1px solid var(--border); box-shadow: none; }
.login-button:hover { color: var(--white); background: var(--p-surface-800, #27272a); box-shadow: none; }
.takeover-hero { background: var(--electric); color: var(--black); }
.takeover-hero::before { opacity: .1; background-image: radial-gradient(var(--black) 1px, transparent 1px); }
.takeover-hero::after { clip-path: polygon(0 75%, 65% 0, 100% 60%, 100% 100%, 0 100%); }
.issue-label { transform: none; color: var(--black); }
.issue-label span { background: var(--white); color: var(--black); border-radius: var(--button-radius); }
h1 span { padding-left: 0; }
.title-one { background: transparent; color: var(--black); transform: none; }
.title-two { background: transparent; color: var(--white); transform: none; box-shadow: none; }
.hero-description, .chapter-copy > p:not(.chapter-index) { color: var(--p-text-muted-color, #a1a1aa); }
.takeover-hero .hero-description { color: var(--black); }
.start-button { background: var(--electric); color: var(--p-primary-contrast-color, #fff); border: 1px solid var(--electric); }
.takeover-hero .start-button { background: var(--black); border-color: var(--black); color: var(--white); }
.takeover-hero .start-button:hover { background: var(--white); border-color: var(--white); color: var(--black); }
.start-button:hover { background: var(--accent); color: var(--p-primary-contrast-color, #fff); transform: translateY(-2px); box-shadow: none; }
.burst { color: var(--black); opacity: .1; }
.preview-board, .chapter-demo, .focus-demo, .crew-demo, .time-ticket {
  background: var(--panel); color: var(--white); border: 1px solid var(--border);
  border-radius: var(--card-radius); transform: none; box-shadow: 0 16px 45px #00000030;
}
.preview-board { border-radius: var(--p-border-radius-xl, 12px); }
.time-ticket { background: var(--white); color: var(--black); border-color: var(--white); }
.scroll-cue { color: var(--black); }
.ticker { transform: none; border-color: var(--white); background: var(--white); color: var(--black); }
.ticker b { color: var(--p-primary-700, #1d4ed8); }
.board-columns h2 span { color: var(--accent); }
.chapter-copy h2 span { background: transparent; color: var(--electric); transform: none; padding-left: 0; margin-left: 0; }
.chapter-link { border-color: var(--electric); }
.chapter-plan, .chapter-together { background: var(--electric); color: var(--black); }
.chapter-plan .chapter-copy > p:not(.chapter-index), .chapter-together .chapter-copy > p:not(.chapter-index) { color: var(--black); }
.chapter-plan .chapter-copy h2 span, .chapter-together .chapter-copy h2 span { color: var(--white); }
.chapter-plan .chapter-link, .chapter-together .chapter-link { border-color: var(--black); }
.feature-chapter::before { content: ''; position: absolute; inset: 0 0 auto; height: 12px; background: var(--white); clip-path: polygon(0 0, 100% 0, 100% 12%, 0 100%); }
.chapter-focus { background: var(--black); clip-path: none; }
.chapter-focus .chapter-copy, .chapter-focus .chapter-copy > p { color: var(--white); }
.chapter-focus .chapter-copy > p:not(.chapter-index) { color: var(--p-text-muted-color, #a1a1aa); }
.chapter-focus .chapter-demo { background: var(--white); color: var(--black); }
.chapter-focus .chapter-link { border-color: var(--electric); }
.big-timer span, .final-call h2 span { color: var(--electric); }
.timer-rule { border-radius: var(--button-radius); background: var(--p-surface-700, #3f3f46); transform: none; overflow: hidden; }
.timer-rule span { border-radius: inherit; }
.chapter-demo :deep(.p-tag) { border-radius: var(--button-radius); }
.crew-symbols span { background: var(--black); color: var(--accent); border: 1px solid var(--border); border-radius: var(--card-radius); transform: none; margin: 0 5px; }
.crew-symbols span:nth-child(2), .crew-symbols span:last-child { background: var(--black); color: var(--accent); transform: none; }
.final-call { background: var(--white); color: var(--black); clip-path: polygon(0 4%, 100% 0, 100% 100%, 0 100%); }
.final-call .start-button { box-shadow: none; }
.takeover a:focus-visible { outline: 3px solid var(--accent); outline-offset: 5px; }
@media (min-width: 640px) { .takeover { width: calc(100% + 3rem); margin: -3rem -1.5rem; } }
@media (max-width: 1100px) { .takeover-hero { padding-inline: 5%; min-height: 700px; } h1 { font-size: clamp(44px, 5.6vw, 64px); } .hero-art { height: 420px; } .preview-board > :deep(.p-card-body) { padding: 13px; }  .board-title { font-size: 21px; } .time-ticket { width: 175px; padding: 12px 18px; } .time-ticket strong { font-size: 48px; } .burst { font-size: 350px; right: -30px; top: -50px; } .feature-chapter { padding-inline: 6%; gap: 6%; min-height: 690px; } }
@media (max-width: 760px) {
  .takeover-nav { padding: 22px 6%; } .takeover-nav :deep(.p-toolbar-end) { gap: 14px; } .brand { font-size: 23px; } .brand b { font-size: 23px; } .nav-features { display: none; } .login-button { font-size: 11px; padding: 8px 16px; }
  .takeover-hero { grid-template-columns: 1fr; padding: 45px 7% 100px; gap: 55px; } h1 { font-size: clamp(49px, 11.5vw, 80px); letter-spacing: -1.5px; } .issue-label { font-size: 8px; letter-spacing: 0; } .issue-label span { padding: 5px; } .hero-description { font-size: 16px; } .hero-ghost { font-size: 210px; right: -20px; }
  .hero-art { width: 88%; max-width: 460px; justify-self: center; height: 420px; } .preview-board { top: 20px; } .burst { top: -70px; } .time-ticket { bottom: 0; } .hero-art figcaption { bottom: -30px; font-size: 6px; } .scroll-cue { position: relative; left: 0; bottom: 0; margin-top: 5px; } .takeover-hero::after { height: 40px; } .ticker-track span { font-size: 26px; }
  .feature-chapter { grid-template-columns: 1fr; padding: 85px 9% 100px; gap: 50px; min-height: 0; } .chapter-copy h2 { font-size: clamp(47px, 10vw, 70px); } .chapter-copy > p:not(.chapter-index) { font-size: 15px; } .chapter-index { font-size: 9px; } .chapter-demo { width: 95%; max-width: 470px; justify-self: center; } .chapter-focus .chapter-demo, .chapter-focus .chapter-copy { grid-column: auto; grid-row: auto; } .chapter-ghost { font-size: 160px; } .chapter-demo > :deep(.p-card-body) { padding: 18px; } .plan-lanes { gap: 8px; } .plan-lanes h3 { font-size: 7px; }   .big-timer { font-size: 85px; } .crew-symbols span { width: 80px; height: 80px; } .crew-demo h3 { font-size: 60px; } .final-call { padding: 80px 7%; } .takeover-footer { flex-wrap: wrap; } .takeover-footer p { order: 3; flex-basis: 100%; }
}
@media (max-width: 390px) { .hero-art { width: 96%; height: 405px; }  .board-caption { font-size: 7px; }  .board-columns { gap: 9px; } .board-title { font-size: 18px; } .time-ticket { width: 155px; } .hero-art figcaption { font-size: 5.5px; } .crew-symbols span { width: 65px; height: 65px; } }
@media (prefers-reduced-motion: no-preference) {
  .motion-on .ticker-track { animation: march 24s linear infinite; } .motion-on .scroll-cue span:last-child { animation: nudge 2s ease-in-out infinite; }
  .motion-on [data-reveal] { opacity: 0; translate: 0 45px; transition: opacity .6s ease, translate .6s cubic-bezier(.2,.7,.2,1); }
  .motion-on [data-reveal].is-visible { opacity: 1; translate: 0 0; }
  .motion-on .takeover-hero.is-active .title-one { animation: headline-in .65s cubic-bezier(.15,.8,.2,1) both; }
  .motion-on .takeover-hero.is-active .title-two { animation: headline-in .65s .12s cubic-bezier(.15,.8,.2,1) both; }
  .motion-on .takeover-hero.is-active .preview-board { animation: board-float 9s ease-in-out infinite; }
  .motion-on .takeover-hero.is-active .time-ticket { animation: ticket-float 5s ease-in-out infinite; }
  .motion-on .takeover-hero.is-active .board-check { animation: check-mark 4s ease-in-out infinite; }
  .motion-on .takeover-hero.is-active .burst { animation: star-tilt 9s ease-in-out infinite; }
  .motion-on .chapter-plan.is-active .plan-lanes section:nth-child(1) .plan-task { animation: task-shift 9s ease-in-out infinite; }
  .motion-on .chapter-plan.is-active .plan-lanes section:nth-child(2) .plan-task { animation: task-shift 9s .65s ease-in-out infinite; }
  .motion-on .chapter-plan.is-active .plan-lanes section:nth-child(3) .plan-task { animation: task-shift 9s 1.3s ease-in-out infinite; }
  .motion-on .chapter-focus.is-active .timer-rule span { transform-origin: left; animation: session-progress 7s ease-in-out infinite alternate; }
  .motion-on .chapter-focus.is-active .big-timer span { animation: timer-beat 3s ease-in-out infinite; }
  .motion-on .chapter-focus.is-active .focus-task i { animation: focus-tilt 4s ease-in-out infinite; }
  .motion-on .chapter-together.is-active .crew-symbols span { animation: crew-bounce 4.5s ease-in-out infinite; }
  .motion-on .chapter-together.is-active .crew-symbols span:nth-child(2) { animation-delay: .45s; }
  .motion-on .chapter-together.is-active .crew-symbols span:nth-child(3) { animation-delay: .9s; }
  .motion-on .chapter-focus.is-active .focus-demo,
  .motion-on .chapter-together.is-active .crew-demo { animation: board-float 10s ease-in-out infinite; }
  .motion-on .feature-chapter.is-active .chapter-ghost { animation: backdrop-drift 12s ease-in-out infinite alternate; }
  .motion-on .final-call.is-active h2 { animation: headline-in .65s cubic-bezier(.15,.8,.2,1) both; }
  @keyframes headline-in { from { opacity: 0; translate: -45px 8px; } to { opacity: 1; translate: 0 0; } }
  @keyframes board-float { 50% { translate: 0 -4px; } }
  @keyframes ticket-float { 50% { translate: 7px -9px; rotate: 3deg; } }
  @keyframes check-mark { 0%, 70%, 100% { scale: 1; } 80% { scale: 1.15; rotate: -7deg; } }
  @keyframes star-tilt { 50% { rotate: 12deg; scale: 1.04; } }
  @keyframes task-shift { 0%, 15%, 80%, 100% { translate: 0 0; rotate: 0deg; } 40%, 55% { translate: 0 -4px; } }
  @keyframes session-progress { from { transform: scaleX(.4); } to { transform: scaleX(1.35); } }
  @keyframes timer-beat { 50% { opacity: .35; } }
  @keyframes focus-tilt { 50% { rotate: -15deg; scale: 1.15; } }
  @keyframes crew-bounce { 50% { translate: 0 -15px; rotate: 5deg; } }
  @keyframes backdrop-drift { to { translate: -25px 12px; } }
  @keyframes march { to { transform: translateX(-50%); } } @keyframes nudge { 50% { transform: translateY(7px); } }
}
@media (prefers-reduced-motion: reduce) { .cut-button { transition: none; } .hero-art, .hero-ghost { transform: none; } }
</style>
