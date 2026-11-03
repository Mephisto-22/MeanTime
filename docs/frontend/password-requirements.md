# Live registration password requirements

Registration includes a labelled **Confirm password** field and a live checklist.
Checks become green check marks as requirements pass and revert when an edit
invalidates a rule. Confirmation updates immediately when either password changes.
Register is disabled until required profile fields are present, the email is
valid, all current password checks pass, and both password fields match. Its
handler also rejects invalid or busy submissions.

## Policy and API

`POST /api/auth/password-requirements` is a public, non-persisting endpoint. It
accepts `{ password, email, display_name }` and returns
`{ requirements: [{ id, description, met }] }` with `Cache-Control: no-store`.
The candidate password and user context are evaluated using the same configured
Django password validators as registration, without looking up accounts.

The current policy checks:

- At least 8 characters.
- No more than 128 characters, matching the registration schema.
- Not entirely numeric.
- Not a commonly used password.
- Not too similar to personal information checked by Django's configured validator.

No new uppercase, symbol, or mixed-case policy was added. Django's validators
remain authoritative at registration, even after the checklist passes.

Checks are debounced by 300 ms after password/email/display-name changes. The
candidate password is sent only to the application's own backend in a POST body;
it is never stored, logged, or included in a URL or response. As with registration,
use HTTPS outside local development. Confirmation stays in the component and is
never sent to the check or registration endpoints. Passwords are not trimmed.

The form clears old checks during a new request and ignores responses for older
input. Request failure keeps Register disabled and offers **Retry password check**.
Emptying the password clears all checks; unmounting cancels scheduled checks and
ignores any outstanding result. Checklist status uses text as well as icons/color
and is associated with the password input for assistive technology.

## Verification

```bash
docker compose run --rm --no-deps --entrypoint python backend manage.py test users.tests kanban.tests --noinput
docker compose run --rm --no-deps --entrypoint sh frontend -c 'pnpm typecheck && pnpm test'
```

Start the database before backend tests. No new migrations are needed.

Vitest covers live checkbox states, matching/mismatching confirmation, changes to
the original password, email-context changes, stale responses, debouncing, network
failure/retry, busy-state guards, and the unchanged registration payload. Django
tests compare checklist results against the actual configured validators, including
common/numeric/similar passwords, empty inputs, and policy configuration changes.

For a demo, open `/register`, type a short password, try numeric-only and common
passwords, then enter a stronger password. Wait for checks to finish, enter a
different confirmation, then correct it. Change the original password again to
show that matching and checklist state are recalculated.
