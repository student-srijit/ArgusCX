# Deploy ArgusCX on Enter while retaining Firebase

## Context
The user approved migrating the existing Next.js frontend to React/Vite and rewriting the Python API as Enter Cloud backend functions, explicitly retaining Firebase login and existing data. This replaces the earlier Cloud-authentication proposal; do not configure a Cloud Google provider.

The current repository has a complete App Router frontend, about fifty REST handlers, MongoDB operational records, PostgreSQL API keys, Cloudinary evidence storage, a LangGraph investigation pipeline, and Python image-analysis/embedding dependencies. Enabling a backend alone does not deploy these features.

## Scope and release gates
Preserve the existing design, routes, Firebase user identities, onboarding, dashboard, evidence capture, cases, integrations, and real data. No demo-data substitutes, silent feature removal, automatic database resets, or deployment-success claims before a live verification.

Private credentials pasted in chat must be revoked/rotated by their owners. Collect replacements only through secure storage. Never embed them in source, plan files, logs, or downloadable artifacts. Firebase browser configuration is public and may be stored in a dedicated configuration module; the Firebase service-account private key is not needed for ordinary signed-token verification.

Python/OpenCV/YOLO/local sentence-transformer workloads are not directly portable to managed TypeScript functions. First distinguish active execution paths from dormant workers and test viable replacements. Any active capability without a validated equivalent is a full-release blocker, not permission to label a partial deployment complete. Preserve the existing rule that unassessed evidence requires human review.

## Implementation checklist

### 1. Establish safe runtime and data access
- [ ] Obtain rotated MongoDB and required integration credentials through secure forms; do not reuse the exposed values. Check actual service reachability without mutating data or printing records/secrets.
- [ ] Inspect the connected Cloud schema before writes; preserve unrelated tables and profiles. Inspect legacy MongoDB collections and the actual PostgreSQL API-key store read-only before selecting migration targets.
- [ ] Validate a small TypeScript-function compatibility spike for Firebase token verification, MongoDB connectivity, Cloudinary signing, and the active image/embedding paths before porting dependent modules. Record any unsupported runtime dependency as a blocker.
- [ ] Preserve existing MongoDB as the operational source initially if the compatibility check passes. Do not create an empty replacement database or silently abandon existing records. If direct access fails, stop the data cutover and present a verified non-destructive export/import approach for approval.
- [ ] Retain PostgreSQL API-key records through a verified copy only if that store is in use. Any new Cloud persistence must use separately named ArgusCX tables, RLS enabled at creation, and server-only writes or correctly scoped owner policies. Retain source databases and preserve IDs, timestamps, hashes, and Firebase UIDs.

### 2. Convert the frontend without redesigning it
- [ ] Create root Vite/TypeScript build entry points (`package.json`, `index.html`, `vite.config.ts`, `src/main.tsx`) and React Router route composition. Keep generated `src/integrations/supabase/client.ts` and `types.ts` unchanged.
- [ ] Port `frontend/app/` pages and dashboard components with explicit routes for `/`, `/login`, `/onboarding`, every existing dashboard page, `/dashboard/cases/:case_id`, and `/verify/:session_id`; preserve the queue redirect and error states.
- [ ] Replace Next navigation/image/metadata usage with router links, navigation hooks, native images, and public HTML metadata. Preserve public asset URLs and CSS-module behavior, reuse the existing design tokens, and avoid broad cosmetic changes.
- [ ] Replace localhost/proxy assumptions in `frontend/lib/api.ts`, `frontend/lib/api_cases.ts`, and page-level fetches with a shared backend-function client using `functions.invoke`. Maintain response/error semantics and send Firebase or application credentials only to the intended protected functions.
- [ ] Split dashboard routes from the public landing-page bundle, avoid eager video loading, and preserve reduced-motion/accessibility behavior. Keep the legacy Python source available as a reference but remove it from the deployed runtime/build path.

### 3. Retain Firebase authentication and authorization
- [ ] Reuse the existing Firebase project and Google sign-in flow in a shared client adapter, with public browser configuration outside unsupported environment variables. Track Firebase token refresh and restoration centrally; do not switch users to Cloud OAuth.
- [ ] Implement backend Firebase token verification using trusted public signing keys and strict issuer, audience, expiry, subject, and verified-email checks. Preserve Firebase UID ownership and existing onboarding profiles.
- [ ] Preserve existing workspace-password access through a backend-only verification path using a rotated secret; no new public email signup. New Cloud application tokens must use new signing material, forcing old exposed sessions to reauthenticate.
- [ ] Enforce account/workspace authorization server-side. Do not issue an unrestricted administrator identity merely because Google authenticated an email. Bootstrap only the configured administrator; preserve existing approved identities after inspection and do not guess ownership of unscoped legacy records.
- [ ] Handle restored/expired sessions, rejected tokens, sign-out, and API 401s consistently without protected-content flashes or redirect loops. Verify the published application hostname is authorized in Firebase; if account-console access is needed, identify the exact owner action rather than claim it was configured.

### 4. Port complete backend behavior by module
- [ ] Implement small functions and shared TypeScript services under `supabase/functions/` for authentication/profile, tickets, verification sessions, cases, evidence, API keys, knowledge, analytics, handoffs/channels, and integration health. Preserve request/response contracts from `backend/app/api/routes/` rather than create placeholder handlers.
- [ ] For Firebase-authenticated entry points, configure gateway verification appropriately and verify Firebase identities inside each protected handler. Handle CORS preflights, API-key access, and scoped customer verification tokens separately; never expose a privileged function without its own authorization.
- [ ] Port session challenge generation, capture URLs/QR codes, upload authorization, expiry checks, single completion, case creation, review/escalation, and closure propagation. Reuse semantics from `sessions.py`, `cases.py`, `risk_engine.py`, and `manifest_service.py`.
- [ ] Preserve Cloudinary image/video storage through signed, scoped uploads and validated server-side metadata. Keep camera capture and outbound-evidence comparison references working; reject unrelated URLs, oversized uploads, and cross-session evidence reuse as authorization violations where appropriate.
- [ ] Port the active retrieval/investigation/resolution/escalation flow and deterministic scoring/policy rules. Configure AI capability/model access only through its required workflow, or securely retain an explicitly selected supported external service. No fabricated order, payment, fraud, or analysis results.
- [ ] Validate equivalent implementations for active image forensics and semantic retrieval. Do not replace forensic results with generic model opinions or report skipped analysis as a pass. Keep existing optional unavailable workers explicitly unavailable; an active lost capability blocks full parity.
- [ ] Replace process-local background tasks with durable, bounded, retry-safe jobs and an independently triggered runner. Verify supported scheduling/runtime limits before selecting the runner. Persist job state and enforce idempotency; do not rely on an open browser or an unawaited function for completion.
- [ ] Preserve live dashboard updates with authenticated bounded polling or verified managed real-time delivery; remove reliance on the process-local WebSocket connection list.
- [ ] Wire only real configured mail, webhook, Cloudinary, store, and payment connectors. Validate signatures and safe retries. Missing configuration must be reported honestly and may block workflows; no destructive live transactions during tests.

### 5. Cutover and publish
- [ ] Deploy each backend function through the deployment tool and validate live configuration and logs. Merely writing files is not deployment.
- [ ] Update production URLs, Firebase authorized-domain requirements, CORS, capture links, and external webhook/API consumers for the new endpoints; remove runtime dependencies on localhost, Redis, Docker, and Next rewrites.
- [ ] Keep the existing deployment and source data unchanged until the full functional checklist passes. If data copying is needed, verify counts and references, define a write-freeze/delta strategy, and do not cut over with concurrent untracked writes.
- [ ] Publish through Enter's Publish action after the build is ready; the final publish action belongs to the user interface. Report the actual live URL/status only after publication is confirmed, not an inferred URL.

## Verification checklist
- [ ] Run root `pnpm exec tsc --noEmit`, `pnpm run lint`, `pnpm run test`, and `pnpm run build`; create focused unit/contract tests for migrated logic. Type-check backend functions and execute their available test runner. Distinguish pre-existing failures from migration failures.
- [ ] Compare every original REST route and frontend caller against its migrated implementation; test positive, missing-data, invalid-input, unauthorized, forbidden, and not-configured outcomes. Production data must not be seeded with test fixtures.
- [ ] Verify real Firebase login, refresh, reload, logout, workspace-password login, and protected navigation; reject forged/wrong-project/expired identities and cross-workspace requests.
- [ ] Verify camera permission denial and success, image/video upload, expired/reused verification tokens, duplicate completion, durable analysis, case review/closure, and ledger filtering against isolated test records.
- [ ] Verify knowledge ingestion/retrieval, tickets, handoff delivery, API-key creation/revocation, webhook authentication, and analytics derived from real persisted records.
- [ ] Verify data preservation and ownership mapping before cutover; confirm no unrelated Cloud tables or existing profiles were modified.
- [ ] Test responsive login and verification layouts at the assumed mobile 390px and desktop 1280px widths, with matching browser evidence; do not claim responsive verification without it.
- [ ] Inspect the built bundle for private credentials and localhost endpoints, and check browser/runtime logs and live network calls. Report any CPU-model, credential, source-data, third-party console, or runtime-limit blocker explicitly.
- [ ] Mark full deployment complete only after a confirmed published build and successful live application/backend checks; otherwise state exactly what remains blocked.
