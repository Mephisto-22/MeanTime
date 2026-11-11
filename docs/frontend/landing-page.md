# Public landing page

`/` is a public, server-rendered introduction to MeanTime with links to `/login`
and `/register`. It uses the shared dark surface palette, blue accents, rounded
panels, and responsive spacing. The example board is static, labeled sample
content; visiting as a guest does not request protected board data.

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
