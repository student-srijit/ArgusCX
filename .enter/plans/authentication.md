# Connect ArgusCX authentication

## Context
Enter Cloud is enabled, but ArgusCX still uses Firebase Google login and a separately configured administrator password. Both issue application JWTs consumed by the Python API. Connecting only the login button would leave the dashboard API rejecting the new session.

This change connects the existing Google login to Enter Cloud while retaining workspace-password login and existing business data. It does not migrate or deploy the Next.js/Python stack; that stack still requires external hosting. No additional login providers or public email signup are included.

## Implementation checklist
- [ ] Check and configure the existing Google provider through the Enter Cloud authentication tool; proceed only after its successful result.
- [ ] Add a browser-only authentication adapter and shared session provider under `frontend/lib/` and `frontend/components/`. Load the generated client only in the browser because it accesses `localStorage` at module load. Leave generated client/types untouched and verify that the frontend bundler can resolve this root-level integration.
- [ ] Register `onAuthStateChange` before session restoration, retain both user and session, and defer client calls outside its synchronous callback.
- [ ] Connect Google login in `frontend/app/login/page.tsx` using the root URL with a trailing slash. Handle the OAuth return through the shared provider mounted in `frontend/app/layout.tsx`; route to onboarding only after the application API accepts the identity. Preserve the existing password endpoint and form.
- [ ] Add a narrowly scoped identity-exchange endpoint in `backend/app/api/routes/auth.py`, with public service configuration in `backend/app/core/config.py`. Validate the Cloud access token server-side against the configured authentication service; never accept browser-supplied roles or a decoded-but-unverified JWT.
- [ ] Require server-authorized account mapping before issuing an application token. The configured administrator may map to the existing `dashboard_admin` subject only after verified identity checks. Existing Firebase users require proof of their current legacy session to link identities; do not merge accounts merely by matching profile email, overwrite existing subjects, or grant all Google users admin access. Preserve the legacy login path for accounts not yet linked.
- [ ] Inspect actual account storage before adding any identity-link records. Preserve MongoDB profiles and all existing Cloud tables; use separate ArgusCX-specific storage if needed, with owner-scoped reads and server-only linking writes. Enable RLS in the creation migration for any new Cloud table.
- [ ] Reuse the application's existing JWT consumer contract and `fetchApi`/`ApiRequestError`. Refresh the exchanged application token from a valid Cloud session before it expires; prevent a stale async exchange from reinstalling tokens after logout.
- [ ] Update `frontend/app/dashboard/layout.tsx` and onboarding initialization to wait for authenticated-session readiness before mounting protected content or making API calls. API middleware remains the authorization authority.
- [ ] Centralize logout across `frontend/components/dashboard/SignOutButton.tsx`, the API page's inline logout, and API 401 handling. Clear Cloud and application session state without a redirect/re-login loop; preserve API-key and customer verification-session access.
- [ ] Keep current UI styling, business routes, onboarding data, and unrelated infrastructure unchanged. Add only dependencies required for authentication to the frontend package.

## Verification checklist
- [ ] Positive: Google OAuth returns to the root, an authorized identity is exchanged, onboarding retains the existing profile, and the dashboard receives accepted application credentials.
- [ ] Positive: existing workspace-password login and legacy account access continue to work.
- [ ] Negative: missing, expired, forged, or wrong-project Cloud tokens are rejected by the exchange; unlinked/unapproved Google identities receive no administrator JWT.
- [ ] Boundary: reload during session restoration does not redirect prematurely; token refresh and logout cannot resurrect stale credentials; failed exchange displays an error without looping.
- [ ] Boundary: sign-out from every existing entry point clears application and Cloud state; API keys and verification-session tokens retain their existing behavior.
- [ ] Add focused authentication unit tests with isolated test doubles, never frontend mock business data. Run the new backend auth tests with `python -m pytest` on their exact test file; run `pnpm --dir frontend run lint`, `pnpm --dir frontend exec tsc --noEmit`, and `pnpm --dir frontend run build` where supported. Report unavailable runtime checks or pre-existing build blockers separately.
- [ ] Perform the real OAuth/API round trip only against a reachable externally hosted application and backend. If those are unavailable, explicitly mark end-to-end authentication and deployment as unverified rather than complete.
