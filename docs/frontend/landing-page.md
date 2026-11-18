# Public landing page

`/` is a public, server-rendered introduction to MeanTime with links to `/login`
and `/register`. It uses the `headless` layout, with a compact PrimeVue Toolbar
for the brand and login link rather than the authenticated application navbar.
PrimeVue Card, Tag, and Button components form a charcoal-and-cobalt composition,
with oversized type, serif accents, and overlapping task, timer, and note cards.
The background matches the site's dark canvas, with pale blue headings, dark
task cards, and coral/lime stickers that retain dark text for contrast.
Scoped styles keep this public-page treatment separate from the application
theme. The page fills the headless layout with responsive spacing; its entrance
animation respects reduced-motion preferences. The board and timer are static,
labeled illustrations, not interactive controls or live data. Visiting as a
guest does not request protected board data.

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
