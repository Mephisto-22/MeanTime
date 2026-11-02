# Notifications and required fields

The app mounts one PrimeVue `Toast` host in `app/app.vue`, outside the page outlet.
It survives navigation and is client-only. The existing `@primevue/nuxt-module`
installs ToastService for the registered Toast component; do not add a second plugin.

## Notify at the UI boundary

Call `useNotifications()` in component/page setup, then notify in the operation's
catch block. API services normalize errors and throw them; they do not also show
toasts. This avoids duplicate alerts and notifications for retried requests.

```ts
const notify = useNotifications()
async function save() {
  try {
    await api.save(payload)
    notify.success('Changes saved.')
  } catch (error) {
    notify.error(error, 'Unable to save changes')
  }
}
```

Success toasts disappear after four seconds. Errors remain until dismissed.
PrimeVue exposes notifications as accessible alerts. Content is text, not HTML.
`getErrorMessage` in `app/utils/errors.ts` formats API detail strings, Ninja
validation lists, errors arrays, nested causes, and ordinary errors. It excludes
submitted validation inputs and stack traces. Server errors use a generic message;
network errors offer a retry message. Never put credentials into error messages.

## Required fields

- Disable save/submit while data is missing, whitespace-only, invalid, or pending.
  Handlers also reject invalid submissions, including keyboard submissions.
- Set PrimeVue `invalid`, `aria-invalid`, and associated inline guidance to explain
  the red outline. Keep field guidance inline instead of toasting each keystroke.
- Optional descriptions may be empty. Shared text/email/password helpers live in
  `app/utils/validation.ts`. Passwords are never trimmed before sending.
- Backend validation remains authoritative. Keep input available after failed
  saves and preserve optimistic-task rollback behavior.
- Load-error screens retain retry/back controls; toasts carry the detailed failure.

Login, registration, board, and task forms follow these conventions. Registration
also retains the live backend password checklist and local password confirmation.
Password reset and OAuth callback pages retain their recovery guidance; other
features should use this notification pattern when updating request feedback.

## Verification

Run `pnpm typecheck`, `pnpm test`, and `pnpm build && pnpm test:smoke` in the frontend
container. Tests cover toast rendering/dismissal, invalid fields, disabled buttons,
error formatting, auth failures, failed board saves, and task rollback notifications.

Manually check empty login/registration fields, incorrect login credentials, empty
board/task titles, and API failures. Each failed operation should notify once.
Dialogs retain input after failed saves; load screens allow retry. Successful
registration and board/task saves show a success toast.
