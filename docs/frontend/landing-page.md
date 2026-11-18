# Public landing page

`/` is a public, server-rendered introduction to MeanTime with links to `/login`
and `/register`. It uses the `headless` layout, with a compact PrimeVue Toolbar
for the brand and login link rather than the authenticated application navbar.
The local design preview uses PrimeVue Card, Tag, Toolbar, and Button components
with the shared PrimeVue primary blue as the dominant background, accented by
black product cards, a white text strip, and contrasting black/white sections.
Hard diagonal section separators distinguish the feature chapters. Cards and
buttons use the product's corner-radius tokens, fine borders, and soft shadows;
headline and card frames are straight rather than comic-style cutouts.
Large typography and subtle background texture remain. Three scrollable
feature sections introduce boards, focus sessions, and shared workspaces.
Copy focuses on everyday plans and casual use. Dark surfaces use the shared
text colors, and primary actions use the shared blue and contrast-color tokens.
The design keeps decoration restrained: a static text divider replaces the
marquee, and background lettering, stars, timer stickers, and extra symbols have
been removed. Section reveals and staggered headline entrances remain, with
slow four-pixel movement on product previews instead of rotating graphics.
The focus section includes a large sample timer and animated progress bar above
the real task card. Its 20-minute readout matches the paused sample task timer.
The header and footer use the text wordmark without a star.
Section animations run only while their section intersects the viewport.
A navigation button pauses/resumes motion;
system reduced-motion preferences disable it. Content remains visible without
JavaScript or IntersectionObserver. The observer and preference listener are
cleaned up when leaving the page.
Scoped styles keep the design separate from the application theme. The boards
and timers are labeled illustrations, not interactive controls or live data.
Visiting as a guest does not request protected board data.

Task examples render the product's `kanban/Task.vue` through
`LandingTaskSample.vue`, using typed local data from `app/data/landingTasks.ts`.
The preview wrapper is inert, with an accessible description outside the inert
content. Priority, tags, descriptions, tracked time, and the paused timer dock
come from the real component; no live board context or API mutations are used.

After browser session restoration, authenticated visitors are redirected to
`/boards`. The existing boards dashboard now lives there and remains protected
by the global auth middleware. Navbar Boards, default email login, and Google
sign-in completion navigate directly to `/boards`. Explicit safe login redirect
destinations continue to work.

Manual review: open `/` without a session; check both account links, keyboard
focus and narrow-screen layout. Sign in, revisit `/`, and confirm the dashboard
opens. Sign out and request `/boards`; confirm the login redirect. Refresh `/`
without a backend available: the introduction and account links still render.

Automated checks: `pnpm typecheck`, `pnpm test`, `pnpm build`, and
`pnpm test:smoke` inside the frontend container. Landing tests cover guest links,
no protected fetch, and redirect timing after session restoration. The production
smoke suite checks public HTML and the protected dashboard's empty SPA shell.
