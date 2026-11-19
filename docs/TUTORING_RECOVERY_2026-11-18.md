# Paid tutoring recovery — 18 November 2026

## Verified blockers

Read-only inspection of the LearnNoelia Vercel project found no Stripe or LiveKit environment variables. The connected Stripe accounts exposed to this session are Foundation, Lovera and SavoryMind sandboxes; the owner confirmed both services exist but has not yet identified the LearnNoelia account/project. Do not substitute another app's merchant account.

Hosted Supabase project `sivntnaaahqsgsqfsixw` has zero tutors, zero tutor sessions, and no `tutor_settlements`, `begin_tutor_settlement` or `finish_tutor_settlement`. The repository's `0050_tutor_settlement_integrity.sql` is therefore not deployed. No production schema, secret, charge or provider configuration was changed during this repair.

## Implemented prerequisite

Room entry previously trusted a session's `live` flag. It now requires tutor acceptance plus a fresh server-side Stripe read proving an exact session/student/tutor binding, manual USD authorization, full approved budget available to capture and matching test/live mode. Missing acceptance/configuration and provider failures deny the token. Cross-tutor URLs are rejected. A client without a token no longer sends heartbeats and gives an actionable retry message instead of environment-variable instructions.

The new `tutor_accepted_at` property is intentionally optional at the TypeScript boundary: old rows without recorded acceptance cannot enter. This change does not add an acceptance writer or silently backfill acceptance. A coordinated schema and acceptance workflow must supply this evidence before reopening starts.

## Next steps requiring the correct accounts

1. Identify/connect the LearnNoelia Stripe account and identify its LiveKit project. Configure credentials through their secure dashboards, not chat.
2. Implement the confirmed payment collection/authorization handoff, immutable rate/budget snapshots, tutor acceptance, and idempotent settlement/cancellation lifecycle against that account's sandbox. Keep `/api/tutor-sessions/start` closed until this is verified. Existing reconciliation is read-only and does not capture held funds.
3. Review and apply the settlement migration and new acceptance workflow to a disposable hosted environment, then approve the exact production migration. The repository has two different `0050_*` migrations; resolve migration-history ordering explicitly rather than blindly pushing the chain.
4. Register a real tutor with an agreed rate and payout setup. No placeholder tutor, credentials or acceptance should be invented.
5. Exercise card confirmation/3DS, declines, abandonment, duplicate/reordered requests, tutor acceptance/decline, cap enforcement, provider outages, end/capture retry and expired authorizations. Verify webhook recovery independently of browser return, as required by [Stripe's fulfillment guidance](https://docs.stripe.com/checkout/fulfillment). Stripe [manual authorization](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method) holds funds; it does not itself confirm captured revenue.

The integration remains blocked, not revenue-ready. No money was moved and no live payment was attempted.
