# Explicit teacher score acceptance gate

Scoped candidate on default commit `8187bf7428d6783f4fc20d19c4368bd3ccf27698`.

## Defect and change
The server action previously coerced a missing, empty or whitespace-only final-score field to numeric zero. Browser `required` validation is not a server-side guarantee. This could save and return an unintended failing mark. The action now requires an explicit, nonempty text value before numeric conversion and the existing bounds checks. An intentional `0`, decimals and surrounding whitespace remain supported. No schema, grade visibility, permissions, AI provider, payment or production configuration changes.

## Acceptance coverage
Action-level synthetic tests exercise missing/blank/nonfinite/negative/out-of-range values; intentional zero/decimal/maximum scores; teacher ownership; student drafts; assignment-specific maximum; unauthenticated callers; failed review writes; and partial return failure. Supabase calls are mocked: these checks do not prove database RLS, hosted publication, browser behavior or AI accuracy.

This closes only the blank-score conversion defect. Review insertion and submission return remain two database operations; partial failure is reported but atomicity/idempotency remains a separate improvement. Physical-device acceptance, signed candidate builds, production data/migrations, complete authored course assessments and real family-reporting acceptance remain open. No live student data or deployment is used.

## Local validation
- Locked install with lifecycle scripts disabled succeeded.
- TypeScript passed.
- Complete `npm test`: 38 Vitest files / 227 tests, 4 storage tests and 5 daily-agent tests passed.
- The new action suite has 17 cases. Running it against untouched default action reproduced exactly three failures (omitted, empty and whitespace score); restoring the fix passes all cases.
- `git diff --check` passed. Hosted CI, browser/database integration and physical-device acceptance are not established by these results.
