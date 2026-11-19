# Registration email confirmation

New email/password registrations must confirm their email before login. After
registration, `/check-email` shows inbox instructions and a resend form. The
email opens `/confirm-email#token=...`; the public page posts the token, removes
it from browser history, and shows confirmation or recovery. Confirmation does
not create a login session. The token is never placed in local storage.

## Backend and database

Migration `users.0009_email_verification` adds `is_verified` (the project's
snake_case equivalent of `isVerified`), a verification version, and last-send
timestamp. Existing and trusted admin/programmatically provisioned accounts
remain verified through the default `True`; the public registration endpoint
always overrides it to `False`. Google-created accounts are verified because the
Google callback already validates Google's `email_verified` claim. Clients cannot
set this field through registration or profile-update schemas. Email is immutable
through the profile endpoint. Admins can review or change verification status.

Unverified users receive 403 on correct-password login; refresh and protected
JWT requests are rejected too. Resetting a password does not verify an email.

- `POST /api/auth/register`: sends the email and returns 201 with the unverified
  profile. A delivery exception rolls back account creation and returns 503.
- `POST /api/auth/email-verification/confirm`: `{ "token": "..." }`. The
  purpose-specific signed link binds the user ID, email, and verification version
  and expires in 24 hours. Invalid, replaced, expired, changed-email, or inactive
  links return 400. Confirming an already-confirmed valid link is idempotent.
- `POST /api/auth/email-verification/resend`: `{ "email": "..." }`. At most one
  send per account per 60 seconds, with row locking. Unknown, inactive, verified,
  and cooldown cases return the same generic 200 message. Successful resends
  invalidate previous links; a failed resend preserves the old link and returns
  503. Delivery failures can therefore distinguish an unavailable delivery for an
  existing account; this is not a constant-time account-enumeration defense.

`services/mail.py` centralizes transactional sending. It handles verification and
password-reset emails. The SES Django backend uses boto3's default credential
chain, including temporary ECS task-role credentials. No AWS access keys belong
in source code. Provider acceptance is not a guarantee of inbox delivery.

## Local development

Keep these values in `.env`:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
DEFAULT_FROM_EMAIL=noreply@meantime.local
AWS_SES_REGION=
```

Run `docker compose up -d --build`. Backend startup applies the migration.
Register a test account, then run `docker compose logs --since 5m backend` and
copy the complete `/confirm-email#token=...` URL. Console output prints plain
URLs so MIME wrapping cannot corrupt the token. It is intended for local
development only. Login should fail before confirmation and succeed afterward.
Resend is available from `/check-email` and linked from the login page. The
registration email is held only in Nuxt memory to prefill the form; refreshing
the page requires entering it again. Requests and toasts follow existing UI
patterns. Confirmation routes are public and server-rendered.

## AWS setup still required

The code is ready for SES, but no AWS identities or sending permissions have
been provisioned or applied by this change. AWS deployments use the SES backend
and fail registration with 503 until sender configuration and permissions work;
they do not silently discard mail. Local console delivery is independently
configurable. Dummy delivery is rejected for transactional mail.

1. Verify a sender address/domain in the app's AWS region (currently configured
   as `us-east-2`). Configure DNS verification/DKIM for a domain identity.
2. For ordinary user recipients, request SES production access. In the sandbox,
   recipients must also be verified, except SES simulator addresses.
3. Supply `ses_sender_identity_arn` and `email_from_address` as Terraform inputs
   to the `infra/envs/dev/app` or `infra/envs/prod/app` layer. Example values:
   `arn:aws:ses:us-east-2:123456789012:identity/example.com` and
   `noreply@example.com`. Both must identify the same authorized sender.
4. Review the Terraform plan and deploy through the team's normal process. The
   app module passes `EMAIL_BACKEND`, `AWS_SES_REGION`, and `DEFAULT_FROM_EMAIL`
   to the backend and grants the task role `ses:SendEmail` only for that identity
   and From address. This feature does not create DNS or SES identities.
5. Verify `FRONTEND_URL` is the address recipients can actually reach. Dev's
   localhost/tunnel links are not reachable from another person's machine.
6. Send a controlled test email and check inbox/spam delivery. Set up bounce and
   complaint handling before enabling unrestricted registration at scale.

Official setup references:
- https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html
- https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
- https://docs.aws.amazon.com/ses/latest/dg/control-user-access.html

## Verification

Inside backend containers: `python manage.py makemigrations --check --dry-run`
and `python manage.py test users.tests kanban.tests --settings=config.test_settings`.
The SQLite test setting is isolated from developer data but does not test
PostgreSQL's locking/concurrency semantics. Backend tests use in-memory email and
mocked SES calls: no real inbox delivery is claimed.

Inside frontend containers: `pnpm typecheck`, `pnpm test`, `pnpm build`, and
`pnpm test:smoke`. Tests cover registration handoff, success/missing/expired
links, resend input and cooldown, delivery errors, public POST payloads, and
public server-rendered cards. Terraform formatting/validation do not provision
or verify AWS email delivery.
