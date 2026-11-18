<template>
  <div class="landing">
    <div class="landing-inner">
      <Toolbar class="landing-nav" aria-label="Welcome navigation">
        <template #start>
          <NuxtLink to="/" class="wordmark" aria-label="MeanTime home"><span aria-hidden="true">✳</span> meantime<span class="wordmark-dot">.</span></NuxtLink>
        </template>
        <template #end>
          <NuxtLink v-slot="{ href, navigate }" to="/login" custom>
            <Button as="a" :href="href" label="Log in" icon="pi pi-arrow-up-right" icon-pos="right" class="login-link" data-testid="landing-login" @click="navigate" />
          </NuxtLink>
        </template>
      </Toolbar>

      <section class="hero" aria-labelledby="landing-title">
        <div class="hero-copy">
          <p class="eyebrow"><span class="status-dot" /> A LITTLE SPACE FOR YOUR NEXT BIG THING</p>
          <h1 id="landing-title">Your tasks.<br>Your time.<br><em>Your way.</em></h1>
          <p class="hero-description">Big ideas. Side projects. Everyday things.<br>Give them a home, find your focus, and make time for what moves you.</p>
          <NuxtLink v-slot="{ href, navigate }" to="/register" custom>
            <Button as="a" :href="href" label="Find your MeanTime" icon="pi pi-arrow-right" icon-pos="right" class="join-button" data-testid="landing-register" @click="navigate" />
          </NuxtLink>
          <p class="cta-caption">Your next chapter starts with a board.</p>
        </div>

        <figure class="collage" aria-label="An illustrated example of a MeanTime workspace">
          <span class="orbit" aria-hidden="true" />
          <span class="collage-spark" aria-hidden="true">✳</span>
          <Card class="workspace">
            <template #title>
              <div class="workspace-title"><span>the good stuff</span><i class="pi pi-ellipsis-h" aria-hidden="true" /></div>
            </template>
            <template #subtitle>A little progress, every day.</template>
            <template #content>
              <div class="sample-columns">
                <section v-for="column in preview" :key="column.title" class="sample-column">
                  <h2>{{ column.title }} <span>{{ column.tasks.length }}</span></h2>
                  <Card v-for="task in column.tasks" :key="task.title" class="sample-task">
                    <template #content>
                      <Tag :value="task.label" :class="task.color" />
                      <p>{{ task.title }}</p>
                      <span class="task-detail"><i :class="task.icon" aria-hidden="true" /> {{ task.detail }}</span>
                    </template>
                  </Card>
                </section>
              </div>
            </template>
          </Card>
          <Card class="focus-sticker">
            <template #content>
              <p class="eyebrow">IN YOUR FOCUS ERA</p>
              <p class="timer">25:00<span aria-hidden="true">↗</span></p>
              <p>One thing at a time.</p>
            </template>
          </Card>
          <Card class="note-sticker">
            <template #content><span aria-hidden="true">↗</span><p>A little less chaos.<br>A lot more <em>you.</em></p></template>
          </Card>
          <figcaption>EXAMPLE WORKSPACE · YOURS STARTS HERE</figcaption>
        </figure>
      </section>

      <section class="possibilities" aria-labelledby="possibilities-title">
        <div class="section-intro"><p class="eyebrow">ROOM TO DO YOUR THING</p><h2 id="possibilities-title">A plan. A little focus.<br>People in your corner.</h2></div>
        <article v-for="(feature, index) in features" :key="feature.title">
          <span class="feature-number">0{{ index + 1 }} /</span>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.description }}</p>
        </article>
      </section>
      <footer><span>meantime.</span><p>Less spinning plates. More moving forward.</p><span class="footer-mark" aria-hidden="true">✳</span></footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Toolbar from 'primevue/toolbar'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ public: true, layout: 'headless' })
useSeoMeta({
  title: 'MeanTime — Your tasks. Your time. Your way.',
  description: 'A home for big ideas, side projects, and everyday things. Organize tasks, find your focus, and work together in MeanTime.',
})

const auth = useAuthStore()
onMounted(async () => {
  await auth.initializeSession()
  if (auth.isAuthenticated) await navigateTo('/boards', { replace: true })
})

const preview = [
  { title: 'Up next', tasks: [
    { title: 'Bring that idea to life', label: 'THE BIG IDEA', color: 'tag-peach', icon: 'pi pi-paperclip', detail: 'A fresh start' },
    { title: 'Make room to make', label: 'PERSONAL', color: 'tag-lilac', icon: 'pi pi-align-left', detail: 'For future you' },
  ] },
  { title: 'Made it happen', tasks: [
    { title: 'Take the first step', label: 'SMALL WINS', color: 'tag-lime', icon: 'pi pi-check-circle', detail: 'Looking good' },
  ] },
]
const features = [
  { title: 'Untangle the ideas.', description: 'Give every task a place. Move it across your board as things come together.' },
  { title: 'Get into your flow.', description: 'Track time on your tasks and give the work in front of you your attention.' },
  { title: 'Make it a team thing.', description: 'Share a board, bring your people, and keep the next step in sight.' },
]
</script>

<style scoped>
.landing {
  --ink: #f4f2eb;
  --paper: #09090b;
  --blue: #a0adff;
  --cobalt: #3f4dde;
  --muted: #b1b1b9;
  --line: #ffffff26;
  color-scheme: dark;
  color: var(--ink);
  background: var(--paper);
  width: calc(100% + 2rem);
  margin: -3rem -1rem;
  min-height: 100svh;
  font-family: Arial, Helvetica, sans-serif;
  overflow: clip;
}
.landing-inner { max-width: 1380px; margin: 0 auto; padding: 28px 5% 0; }
.landing-nav { padding: 0 0 24px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
.wordmark { display: flex; align-items: center; gap: 8px; color: var(--ink); font-size: 29px; font-weight: 800; letter-spacing: -1.5px; text-decoration: none; }
.wordmark > span:first-child { font-size: 37px; color: var(--blue); font-weight: 400; }
.wordmark .wordmark-dot { color: var(--blue); margin-left: -8px; }
.login-link { background: transparent; border: 0; color: var(--ink); border-radius: 0; font-weight: 600; }
.login-link:hover { background: #ffffff0c; border-color: transparent; color: var(--blue); }
.hero { display: grid; grid-template-columns: 1fr 1.1fr; gap: 3%; align-items: center; padding: 74px 0 80px; }
.hero-copy { position: relative; z-index: 1; }
.eyebrow { font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; line-height: 1.6; }
.hero-copy > .eyebrow { display: flex; align-items: center; gap: 9px; margin-bottom: 25px; }
.status-dot { width: 7px; height: 7px; background: var(--blue); border-radius: 50%; flex-shrink: 0; }
h1 { font-size: clamp(58px, 6vw, 82px); line-height: .98; letter-spacing: -5px; font-weight: 800; }
h1 em { font-family: Georgia, 'Times New Roman', serif; color: var(--blue); font-weight: 400; letter-spacing: -4px; }
.hero-description { max-width: 370px; font-size: 16px; line-height: 1.7; margin: 25px 0; color: var(--muted); }
.join-button { background: var(--cobalt); color: white; border: 1px solid #7784f0; padding: 15px 22px; border-radius: 100px; font-size: 14px; gap: 24px; }
.join-button:hover { background: #505fe8; border-color: #929df8; color: white; transform: translateY(-2px); }
.cta-caption { color: var(--muted); font-size: 11px; margin-top: 12px; }
.collage { position: relative; min-width: 0; height: 510px; margin: 0; isolation: isolate; }
.orbit { position: absolute; width: 390px; height: 390px; max-width: 90%; background: #623a35; border-radius: 50%; right: -4%; top: 18%; z-index: -1; }
.collage-spark { position: absolute; font-size: 106px; right: 4%; top: -27px; color: #f48b72; line-height: 1; transform: rotate(12deg); }
.workspace { position: absolute; width: 92%; left: 0; top: 80px; background: var(--cobalt); color: white; border-radius: 14px; border: 1px solid #8490f4; transform: rotate(-5deg); box-shadow: 8px 10px 0 #000000; }
.workspace :deep(.p-card-body) { padding: 22px; gap: 5px; }
.workspace :deep(.p-card-subtitle) { color: #e0e4ff; font-size: 11px; }
.workspace-title { display: flex; align-items: center; justify-content: space-between; font-size: 22px; font-weight: 700; letter-spacing: -.7px; }
.sample-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 15px; }
.sample-column { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.sample-column h2 { display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 500; color: #f0f1ff; }
.sample-column h2 span { opacity: .75; }
.sample-task { background: #22242f; color: var(--ink); border-radius: 6px; box-shadow: none; }
.sample-task :deep(.p-card-body) { padding: 13px; }
.sample-task p { font-size: 14px; line-height: 1.3; font-weight: 600; margin: 10px 0 16px; }
.sample-task :deep(.p-tag) { padding: 3px 6px; border-radius: 3px; font-size: 7px; letter-spacing: .6px; color: #30302d; }
.tag-peach { background: #ffd5ba; }
.tag-lilac { background: #ded5fc; }
.tag-lime { background: #e1efba; }
.task-detail { display: flex; align-items: center; gap: 5px; font-size: 9px; color: #c2c3cc; }
.task-detail i { font-size: 10px; }
.focus-sticker { position: absolute; top: 4px; left: 7%; width: 190px; background: #e1f29b; color: #222321; transform: rotate(7deg); border: 1px solid #151518; border-radius: 6px; box-shadow: 3px 4px 0 #000000; z-index: 2; }
.focus-sticker :deep(.p-card-body) { padding: 15px 18px; }
.focus-sticker .eyebrow { font-size: 8px; letter-spacing: 1px; }
.timer { display: flex; justify-content: space-between; align-items: center; font-size: 36px; font-weight: 600; letter-spacing: -2px; line-height: 1.3; }
.timer span { font-size: 26px; }
.focus-sticker p:last-child { font-size: 10px; }
.note-sticker { position: absolute; bottom: 27px; right: -2%; background: #f38369; color: #222321; width: 215px; transform: rotate(8deg); border: 1px solid #151518; border-radius: 2px; box-shadow: 4px 5px 0 #000000; z-index: 2; }
.note-sticker :deep(.p-card-body) { padding: 17px 20px; }
.note-sticker span { font-size: 30px; line-height: 1; }
.note-sticker p { font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.15; margin-top: 8px; }
.collage figcaption { position: absolute; bottom: -9px; left: 5%; font-family: 'Courier New', monospace; font-size: 8px; letter-spacing: 1px; }
.possibilities { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; gap: 30px; padding: 34px 0 38px; border-top: 1px solid var(--line); }
.section-intro .eyebrow { font-size: 8px; margin-bottom: 8px; }
.section-intro h2 { font-family: Georgia, 'Times New Roman', serif; font-size: 24px; letter-spacing: -.6px; line-height: 1.15; }
.feature-number { font-family: 'Courier New', monospace; color: var(--blue); font-size: 11px; }
.possibilities h3 { font-size: 14px; font-weight: 700; margin: 12px 0 8px; }
.possibilities article p { color: var(--muted); font-size: 12px; line-height: 1.7; max-width: 210px; }
footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 0; border-top: 1px solid var(--line); }
footer > span:first-child { font-size: 16px; font-weight: 800; letter-spacing: -.7px; }
footer p { font-size: 10px; color: var(--muted); }
.footer-mark { color: var(--blue); font-size: 26px; }
.landing a:focus-visible { outline: 3px solid #e1f29b; outline-offset: 5px; }
@media (min-width: 640px) { .landing { width: calc(100% + 3rem); margin: -3rem -1.5rem; } }
@media (min-width: 1400px) { .hero { gap: 6%; } }
@media (max-width: 1050px) {
  .hero { padding: 55px 0 60px; }
  h1 { font-size: 72px; }
  .collage { height: 470px; }
  .workspace :deep(.p-card-body) { padding: 16px; }
  .sample-task :deep(.p-card-body) { padding: 10px; }
  .focus-sticker { width: 160px; }
  .note-sticker { width: 180px; bottom: 0; }
  .note-sticker p { font-size: 21px; }
  .collage figcaption { bottom: -24px; }
  .possibilities { grid-template-columns: 1fr 1fr; gap: 26px; }
}
@media (max-width: 760px) {
  .landing-inner { padding: 20px 6% 0; }
  .hero { grid-template-columns: 1fr; gap: 38px; padding: 40px 0 60px; }
  h1 { font-size: clamp(60px, 12vw, 86px); letter-spacing: -3.5px; }
  .hero-copy > .eyebrow { font-size: 8px; margin-bottom: 18px; }
  .hero-description { font-size: 15px; max-width: 400px; margin: 20px 0; }
  .collage { width: 100%; max-width: 490px; justify-self: center; height: 480px; }
  .workspace { width: 94%; left: 1%; }
  .note-sticker { bottom: 2px; right: 0; }
  .collage figcaption { bottom: -25px; left: 0; }
  .orbit { width: 330px; height: 330px; right: 0; }
  .wordmark { font-size: 25px; }
  .wordmark > span:first-child { font-size: 30px; }
}
@media (max-width: 390px) {
  .collage { height: 460px; }
  .workspace-title { font-size: 19px; }
  .sample-task p { font-size: 12px; }
  .sample-columns { gap: 8px; }
  .note-sticker { width: 165px; }
  .possibilities { gap: 24px 18px; }
  .section-intro h2 { font-size: 21px; }
  footer p { max-width: 150px; text-align: center; }
}
@media (prefers-reduced-motion: no-preference) {
  .hero-copy, .collage { animation: arrive .65s ease-out both; }
  .collage { animation-delay: .12s; }
  .join-button { transition: transform .2s, background .2s; }
  @keyframes arrive { from { opacity: 0; translate: 0 14px; } to { opacity: 1; translate: 0 0; } }
}
</style>
