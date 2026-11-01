# Google sign-in

People can sign in, or create an account, with their Google account: **Continue
with Google** on the login and register pages. Django talks to Google directly
with OpenID Connect (authorization code flow with PKCE), with no extra libraries
and no AWS Cognito.

The button only appears when the backend has a Google client ID and secret. Without
them, Google sign-in is off and everything else works as before.

## How it works

1. The button is a plain link to `/api/auth/oauth/google/start`. Django saves a
   random state, nonce and PKCE verifier in the Django session (the `sessionid`
   cookie) and redirects the browser to Google.
2. After the person picks an account, Google redirects the browser to
   `/api/auth/oauth/google/callback` with a one-time code. Django checks the state,
   exchanges the code with Google server to server (using the client secret and
   the verifier), and checks the ID token's issuer, audience, expiry, nonce and
   verified email.
3. Django finds or creates the user and redirects to the frontend's
   `/oauth/callback#access_token=…&refresh_token=…`, the same JWTs that
   `/api/auth/login` returns. Browsers never send the `#` part to a server, so the
   tokens don't end up in any log. The page saves them, removes them from the
   address bar and opens the board.
4. If anything fails, Django redirects to `/login?oauth_error=<reason>` instead,
   and the login page explains it (see [Errors](#errors)).

The backend code is in `backend/users/oauth.py`. On the frontend:

- `app/components/GoogleSignInButton.vue` is the button.
- `app/pages/oauth/callback.vue` is the callback page.
- `loginWithTokens` in `app/stores/auth.ts` signs in with the tokens.

!!! note
    The `/api/**` proxy in `frontend/nuxt.config.ts` has `redirect: 'manual'`, so
    Django's redirects reach the browser. Without it, the proxy follows the
    redirect to Google itself and sign-in breaks.

## Accounts

- **Linked by Google's account ID, not email.** The `external_accounts` table
  (`ExternalAccount` in `users/models.py`) stores Google's permanent ID for the
  account (the ID token's `sub`). The same Google account always signs in to the
  same MeanTime account, even if its email changes. The Django admin shows a user's
  linked Google account on their page.
- **The first sign-in creates the account**, with the Google profile's name as the
  display name and **no password**.
- **An email that's already in use is refused.** If a MeanTime account already has
  that email, Google sign-in is refused with `email_in_use`, and the person logs in
  with their password instead. Accounts are never linked automatically, so a Google
  account can't take over an existing MeanTime account.
- **Accounts without a password** can't log in with a password, and password reset
  doesn't send them a link. To deactivate the account, `DELETE /api/users/me`
  takes the account's `email` instead of `password`.
- **Deactivated accounts** can't sign in with Google either (`inactive`).

## Errors

| `oauth_error` | When | Login page says |
| --- | --- | --- |
| `cancelled` | The person cancelled on Google's page | Google sign-in was cancelled. |
| `email_in_use` | The email already belongs to a MeanTime account | An account with this email already exists. Log in with your email and password. |
| `email_unverified` | Google hasn't verified the account's email | Your Google account's email address isn't verified… |
| `inactive` | The linked MeanTime account is deactivated | This account is inactive. |
| `unavailable` | No client ID or secret is set | Google sign-in isn't available right now… |
| `failed` | Anything else: a replayed or forged callback, a failed code exchange, an invalid ID token | Google sign-in failed. Please try again. |

The backend logs failed code exchanges as warnings. The log message never includes
the secret.

## The Google OAuth client

MeanTime has one OAuth client, used by every environment. To create one (Google
Cloud console):

1. **APIs & Services → OAuth consent screen:** set it up as **External**. While its
   publishing status is **Testing**, only the test users listed there can sign in.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type
   **Web application**.
3. Add both **Authorized redirect URIs**:
    - `http://localhost:3000/api/auth/oauth/google/callback`, for local development,
      and for Dev, which is opened through the tunnel on `localhost:3000`
    - `https://meantime.click/api/auth/oauth/google/callback`, for Prod
4. Copy the client ID and secret.

The redirect URI is `FRONTEND_URL` followed by `/api/auth/oauth/google/callback`,
and Google requires it to match exactly. If you serve the app at another address,
add that address's URI to the client too.

## Try it locally

1. Put the client ID and secret in `.env`. Docker Compose passes them to the backend:

    ```bash
    GOOGLE_OAUTH_CLIENT_ID=<about 72 characters, ending in .apps.googleusercontent.com>
    GOOGLE_OAUTH_CLIENT_SECRET=<the secret>
    ```

2. Run `docker compose up -d` so the backend picks up the new `.env`.
3. Open http://localhost:3000/login and select **Continue with Google**.

Leave both empty to turn Google sign-in off. If Google says **Error 401:
invalid_client**, the client ID was copied incompletely.

## In AWS

The base layer (`infra/modules/persistent-data/google_oauth.tf`) creates two
Parameter Store entries in each account:

- `/meantime/<env>/google-oauth-client-id`
- `/meantime/<env>/google-oauth-client-secret`

ECS passes them to the backend when the task starts. Terraform creates them with a
placeholder, so after the first `apply` of each account's base layer:

1. In that account's AWS console, open **Systems Manager → Parameter Store**.
2. Edit each entry, paste the value, and keep the type **SecureString**.

Terraform never overwrites them afterwards, so the real values are never in the
repository or the Terraform state. A running task keeps the values it started with:
after changing them, bring the app layer up again.

Terraform sets `FRONTEND_URL`: `https://meantime.click` in Prod and
`http://localhost:3000` in Dev. Because Prod is served over HTTPS, Django marks the
session cookie `Secure` there. See the [Infrastructure Guide](infrastructure/index.md#domain-and-https)
for the domain.

## API

| Method and route | Response |
| --- | --- |
| `GET /api/auth/oauth/providers` | `200 { providers }`: `["google"]` when Google sign-in is on, otherwise `[]` |
| `GET /api/auth/oauth/google/start` | Redirect to Google, or to `/login?oauth_error=unavailable` |
| `GET /api/auth/oauth/google/callback` | Redirect to `/oauth/callback#…` with the tokens, or to `/login?oauth_error=<reason>` |

All three are public. The last two are browser redirects, so they're opened as
pages rather than called with `fetch`.

## Tests

```bash
docker compose exec backend python manage.py test users.tests.test_oauth
docker compose run --rm --no-deps --entrypoint sh frontend -c 'pnpm test tests/pages/google-sign-in.test.ts'
```

`backend/users/tests/test_oauth.py` replaces Google's token endpoint with a mock,
so the tests never reach Google. They cover the redirect, state and replay checks,
ID token checks, new and returning accounts, the same-email refusal, inactive
accounts, and deactivating an account without a password.
`frontend/tests/pages/google-sign-in.test.ts` covers the button, the callback page
and the login page's error messages.

References: [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html),
[Google: OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
