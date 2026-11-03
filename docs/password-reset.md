# Password reset

The Sprint 2 flow lets a user request a reset link, choose a new password, and
return to login. Mailgun and real email delivery are deferred. With
`DJANGO_DEBUG=1`, development console delivery prints a plain, unwrapped link in
backend container logs. It deliberately bypasses MIME serialization: quoted-printable
email output can wrap the URL and truncate the token when copied or clicked.
With debug off, delivery is disabled using the dummy backend.
Configure real delivery before enabling this flow for production users.

## Try it locally

1. Start the application with `docker compose up --build`. The backend entrypoint
   applies the new users migration automatically. Existing accounts are preserved.
2. Register a test account if needed, then select **Forgot your password?** on login.
3. Submit that account's email at `/forgot-password`.
4. Run `docker compose logs backend` and open the reset URL printed in the console
   message. No email is sent to an inbox.
5. The public `/reset-password` page verifies the link, activates the reset state,
   and displays the new-password form. Login is blocked while that state is active.
6. Enter matching passwords that pass Django's configured password validators.
7. Return to login. The old password fails and the new password succeeds.
8. Reusing the completed reset link fails. Expired/malformed links also fail and
   offer a way to request another link.

Set `FRONTEND_URL` in `.env` if the frontend is not at `http://localhost:3000`.
Compose passes it to Django. Links use this configured origin, never the request's
Host header. UID and token are carried in a URL fragment so they are not sent in
the frontend HTTP request or its access logs. Do not share development reset URLs
or backend log excerpts containing them.

## API

All three endpoints are public and use `{ auth: false }` in `AuthApi`.

| Method and route | Request body | Success |
| --- | --- | --- |
| `POST /api/auth/password-reset` | `{ email }` | Generic `200 { detail }`, whether an account exists or not |
| `POST /api/auth/password-reset/validate` | `{ uid, token }` | `200 { detail }`; activates the reset restriction |
| `POST /api/auth/password-reset/confirm` | `{ uid, token, password, password_confirm }` | `200 { detail }`; saves the hashed password and clears the restriction |

Invalid/expired links and invalid password choices return `400 { detail }`.
Invalid request shapes return 422. The request endpoint never returns a reset
token or reveals whether an email belongs to an active account.

## User state and authentication

- `resetting_password` is the users-table boolean for the backlog's
  “resetingPassword” item, following the backend's snake_case convention.
- `password_reset_started_at` bounds the login restriction. Submitting someone
  else's email never sets the flag. Only possession of a valid link does.
- Abandoned restrictions expire after `PASSWORD_RESET_TIMEOUT` (one hour).
  Reopening an active link does not extend the restriction.
- `password_version` increments on completion. JWTs include the version at login,
  so reset invalidates prior access and refresh tokens. Legacy tokens without a
  version count as zero until the user's first reset.
- `AppJWTAuth` in `users/authentication.py` enforces these application-wide JWT
  rules. Reset-link helpers live at the top of `users/api.py`, alongside the routes.
- Login returns 403 during an active reset. Protected JWT requests and refresh
  return 401 during reset or after a password-version mismatch.
- Django's password reset token generator supplies expiring links. Changing the
  password invalidates every previously issued link. Confirmation locks the user
  row and verifies the token within the transaction to prevent double use.
- Reset tokens and passwords never enter local storage. The reset page clears the
  browser's auth session after validation/completion and removes the URL fragment
  after completion. It does not automatically log in.

## Tests

```bash
docker compose run --rm --no-deps --entrypoint python backend manage.py makemigrations --check --dry-run
docker compose run --rm --no-deps --entrypoint python backend manage.py test users.tests kanban.tests --noinput
docker compose run --rm --no-deps --entrypoint sh frontend -c 'pnpm typecheck && pnpm test'
docker compose run --rm --no-deps --entrypoint sh frontend -c 'pnpm build && pnpm test:smoke'
```

Start the database container before backend tests. Django uses a separate test
database. Tests cover generic responses, expiry and reuse, password validation,
login restrictions, session invalidation, successful login afterward, frontend
payloads, mismatches, errors, and successful confirmation. The console regression
uses the exact printed URL to validate, complete a reset, and reject reuse.
Frontend tests use Vitest and Vue Test Utils under Nuxt's test environment:
`tests/api/password-reset.test.ts`, `tests/components/password-reset.test.ts`, and
`tests/pages/password-reset.test.ts`. Production routing is checked by
`tests/smoke/protected-rendering.smoke.test.ts`.

Before production rollout, connect and verify the deferred email provider and
configure delivery monitoring and request throttling at the API or gateway.

References: [Django password reset](https://docs.djangoproject.com/en/5.2/topics/auth/default/#django.contrib.auth.views.PasswordResetView)
and [console email backend](https://docs.djangoproject.com/en/5.2/topics/email/#console-backend).
