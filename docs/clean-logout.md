# Clean logout and token blacklisting

The navbar's **Log out** button calls `useAuthStore().logout()`. It starts server
revocation, clears the local tokens/user and Nuxt's cached page data, then redirects
to login immediately with history replacement. The button prevents duplicate
requests while revocation is pending. A full reload cannot restore cleared tokens.

## Backend

`POST /api/auth/logout` accepts:

```json
{ "refresh_token": "...", "access_token": "..." }
```

`access_token` is optional. No bearer header is required: possession of a signed,
unexpired refresh token authorizes revoking that session, including when its access
token has expired. Signature, expiry, and refresh-token type are verified before
any blacklist mutation. Repeated requests return `200 { "detail": "Logged out
successfully." }`. Invalid/expired refresh tokens return 401; wrong token types or
mixed-session pairs return 400. Malformed request bodies return 422.

The `ninja_jwt.token_blacklist` app stores persistent outstanding/blacklisted tokens.
The refresh token is blacklisted, and a valid supplied access token is explicitly
blacklisted as well. Login and Google OAuth token issuance set `session_jti` to the
refresh token's JTI; refreshed access tokens inherit this claim. `AppJWTAuth` rejects
an access token if either its own JTI or its session's refresh JTI is blacklisted.
This also covers access tokens created by a concurrent refresh before logout.

Logout revokes the current session. Other devices/sessions can continue working,
and signing in again creates a new session. Existing password-reset and account
restrictions remain in effect.

Legacy access tokens without `session_jti` are revoked directly when supplied.
Legacy refresh tokens gain the session link when used to refresh. Unprovided
legacy access tokens cannot be associated retroactively; they expire normally.
Invalid/expired optional access tokens are ignored since they are already unusable.

## Database setup and cleanup

The new installed app has its own migrations. The normal backend container
entrypoint applies them automatically; for an existing deployment run:

```bash
docker compose exec backend python manage.py migrate
```

No users-table migration is required. Schedule the library's cleanup command, for
example daily:

```bash
docker compose exec backend python manage.py flushexpiredtokens
```

Logout retains the refresh blacklist record through its signed expiration **plus
the access-token lifetime**. A refresh made just before expiry can mint access
that outlives the refresh token; cleanup must not remove revocation prematurely.
Signed token expiry itself is not extended.

## Frontend behavior

`AuthApi.logout` uses a public POST with automatic auth refresh disabled and a
10-second request timeout. Revocation failure still signs out locally, but login
shows that server token revocation could not be confirmed. It does not claim the
tokens were blacklisted when the server could not confirm it. An expired refresh
token is also treated as unconfirmed revocation. Tokens are not kept locally for
retry; there is no logout retry through automatic refresh.

An in-memory session revision changes when credentials are cleared. Pending login,
profile, and refresh responses cannot restore the old session, and API requests
from an old revision cannot be retried under a newly signed-in user's credentials.
Revision and loading state are never persisted. A late logout failure does not
redirect a user who has already signed in again.

## Verification

```bash
docker compose run --rm --no-deps --entrypoint python backend manage.py test users.tests kanban.tests --noinput
docker compose run --rm --no-deps --entrypoint sh frontend -c 'pnpm typecheck && pnpm test'
```

The database container must be running; Django uses a separate test database.
Tests cover blacklist persistence, access/refresh rejection, access minted by
refresh, session isolation, token ownership/types/expiry, repeated logout, legacy
tokens, local/cache cleanup, navbar behavior, and in-flight request protection.

Manually sign in, select **Log out**, and verify login appears and local storage
no longer has `meantime.auth`. Reload or use Back: protected routes should require
login. In a controlled test, retain a copy of the old pair before logging out and
verify `/api/auth/me` and `/api/auth/refresh` reject it afterward. Do not paste tokens into
shared logs or screenshots. Repeat with the backend unavailable: local logout
still succeeds and the unconfirmed-revocation message appears.
