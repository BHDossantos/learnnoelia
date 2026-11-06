# Tutor payment containment and reconciliation — 5 November 2026

This candidate is stacked on PR #61 head `2da5237d189d19968e09b0698c71fcccae747f8b`. It preserves that draft's account-deletion, dependency and native-readiness work. No production migration, deployment, charge, capture, cancellation, credential change or scheduler activation occurred.

## Defects fixed in code

- Session start previously created an **unconfirmed** PaymentIntent, returned its secret to a client that never confirmed it, and admitted the learner to LiveKit. New paid sessions now fail closed with an explicit unavailable message in API and UI. There is deliberately no environment switch to re-enable the incomplete flow.
- End previously swallowed capture errors, marked the call ended, then attempted a user-client `payments` insert blocked by RLS and ignored its error. It could report money captured when neither provider nor database confirmed it.
- End now freezes a durable session/receipt binding before external work, closes the room independently, retrieves the provider receipt read-only, and records only bound, succeeded, USD receipts within the approved budget. It never captures or cancels an uncertain legacy authorization. Legacy intents without `metadata.session_id`, requires_capture, mismatches and other unconfirmed states remain `review_required`; timeouts remain retryable.
- Settlement finalization writes its state, a deterministic payment ID and session amount atomically. Duplicate requests share a locked journal row. A unique intent constraint prevents one receipt from serving two sessions. Confirmed states cannot be downgraded by a concurrent stale snapshot. Existing payment rows are preserved for review, not silently deleted or duplicated.
- Migration `0050` removes participant INSERT/UPDATE/DELETE access to tutor sessions. Only the server role can write their billing/receipt fields. Read access remains participant-scoped. Both settlement functions are SECURITY INVOKER and executable only by service_role, with an explicit participant check when freezing.
- Heartbeats no longer write estimates into `cents_charged`. End UI does not declare success on HTTP error, disconnection is distinct from confirmed completion, and an ended session cannot mint a new room token.
- The authenticated operator POST `/api/tutor-sessions/reconcile` freezes calls with no heartbeat for five minutes, rotates a bounded pending-review queue, retries room cleanup, and re-fetches provider state. It uses existing CRON_SECRET authentication; it is **not scheduled** by this candidate. It makes no Stripe financial mutations. Review-required legacy receipts still require operator investigation, not blind retries or metadata changes.
- Lesson create and edit now share stored-body validation. Edits validate against the persisted lesson kind before UPDATE; malformed content, wrong shapes and invalid quiz answers are rejected. Supported extra content is retained.

## Release gates and remaining work

1. Review/apply `0050` on a disposable Supabase instance and validate full existing migration-chain compatibility, grants/RLS and deletion/retention behavior. The new journal follows existing session cascade deletion; retaining financial evidence outside account deletion remains an explicit policy decision.
2. Deploy the reviewed API/UI and migration in a coordinated window. Old writers are incompatible with the restrictive session policy. No production release is implied by passing local tests.
3. Build and test real payment-method collection/confirmation and server-side authorization **before** restoring paid-session entry. Use exact session-bound provider metadata, immutable rate/budget snapshots, idempotent create/capture operations, refunds/failed capture and physical-device acceptance. This candidate does not make tutoring revenue-ready.
4. Audit historical sessions/payments and any requires_capture authorizations manually against Stripe. Do not capture, cancel, refund or attach missing metadata without an authorized financial decision. Historical app accounting was untrustworthy.
5. Approve a reconciliation schedule separately if needed. The endpoint is bounded to 50 stale sessions and 50 queued rows per invocation. Large queues need monitoring/pagination/throughput review. Add provider lifecycle/refund acceptance before claiming comprehensive billing automation. Room cleanup for a terminal receipt requires an explicit repeat end request if the first deletion failed; the automated queue only includes pending/review receipts. Add a separately persisted cleanup job before relying on fully automated room retirement.
6. Existing #61 deployment, deletion and store gates remain. Vercel Git deployment is explicitly disabled for this isolated review branch.

## Validation and limits

Vitest includes route tests for provider failure, durable-save failure, repeated end, participant authorization, room cleanup, unavailable start, and operator recovery; receipt identity/amount tests; lesson validation; and PGlite tests for RLS write denial, actor checks, duplicate receipt rejection, transaction rollback, repeat/concurrent reconciliation and no terminal downgrade. PGlite uses a minimal fixture mirroring affected tables, not a full hosted Supabase project or multi-process provider test. Stripe/LiveKit are mocked; no real service was called by tests.

Supabase CLI migration creation was attempted but the installed CLI could not initialize `/home/agent/.supabase` on this environment's read-only filesystem, including after a scoped permission request. The migration was authored in the repository's established sequential convention and executed in the isolated PGlite tests. Hosted advisors and the full Supabase migration harness remain unrun; this is a release gate, not a claimed check.

Local validation: `npm test` passed 92 Vitest tests across 13 files plus 4 storage tests; `npm run typecheck`, `npm run lint`, and `npm run build` passed. Lint retains the existing SessionRoom effect-dependency and AttachmentViewer image warnings. No browser/device or hosted database/provider acceptance was run.
