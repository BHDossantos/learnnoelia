# November 2 release-readiness fixes

Draft branch `fix/store-readiness-20261102`, based on default-branch commit
`050d99bbc62dc7052d831b36e133b0f76ed58457`. No merge, deployment, signed build,
store submission, credential change, or store-setting change was performed.
Vercel Git deployments are disabled specifically for this review branch.

## Included

- Reapplied PR #53's secret-free Android/iOS validation and unit workflow onto
  current product code. Its three-file commit applies cleanly; later product and
  security changes are retained. PR #57's three corrected teacher selectors are
  included. Existing PRs are left untouched.
- Account deletion cancels an existing Stripe subscription before removing its
  database link, recursively removes only the authenticated user's submission
  uploads, stops on storage/billing failures, then deletes the auth account and
  signs out. The client navigates explicitly after success rather than catching
  Next's redirect exception. Partial cleanup is retryable; canceled billing and
  deleted files cannot be rolled back if a later operation fails.
- Manual signing workflow no longer embeds Android signing secrets in shell
  source, checks all required iOS signing inputs, fails on native project
  generation errors, avoids printing secret lengths, and removes temporary
  signing material even after failures. The workflow was NOT dispatched.

## Verified in this workspace

- Locked npm install, TypeScript and all 30 unit tests passed.
- Nine new deletion tests cover authentication/configuration, scoped recursive
  upload cleanup and pagination, errors, cancellation ordering, retries and
  successful account deletion. These use mocks; no live user was deleted.
- Next production build passed, with two pre-existing lint warnings.
- Workflow YAML and inline Bash syntax checks passed; `git diff --check` passed.
- Full browser tests could not start: Docker failed unpacking the local database
  image with `failed to register layer: no space left on device`. No existing
  Docker containers, images or user data were removed. The selector fixes retain
  PR #57's prior three-test evidence, not a new local browser pass.

## Dependency follow-up

Pinned Next and eslint-config-next to 15.5.28 to resolve the critical Next image
optimization and Server Actions advisories, and updated transitive qs within its
supported range. TypeScript, all 30 tests and the production Next build passed after these updates. The final production audit has **one high
Zod advisory**, with no critical or moderate findings. Its advertised fix is a
Zod 3-to-4 major migration, spanning 32 form/action/API modules. This remains
unmet: migrate with request/form compatibility coverage and a working browser/
database suite rather than forcing an unverified validation behavior change.

## Signed release evidence and outstanding gates

Read-only GitHub job checks reconfirmed the historical [Play internal upload](https://github.com/BHDossantos/learnnoelia/actions/runs/37953690928) and
[TestFlight upload](https://github.com/BHDossantos/learnnoelia/actions/runs/37972966192)
from October 9 succeeded, including signing and upload steps. These are historical
artifacts, NOT proof that the current commit is signed or accepted by either store.

Before release: approve and run the current candidate's signed pipeline, verify
signing/provisioning and service-account access, exercise physical iOS/Android
installation, microphone and deletion using disposable test accounts and real
Storage, and confirm database migrations are applied. Deletion's mock tests do
not prove hosted Storage, Auth or Stripe availability. Existing access JWTs may
remain valid until expiry; review sensitive operations against deployed RLS and
session settings. School-authored shared content with SET NULL foreign keys can
remain after an author is deleted; confirm privacy wording and retention needs.

Store review still requires product-owner confirmation of privacy/Data Safety
answers, account deletion URL, age/children disclosures, screenshots, support,
reviewer access and monetization policy for the hosted web app. These external
store actions were not authorized or performed.

## November 3 follow-up (supersedes the local database blocker above)

Upgraded Zod to 4.6.7, Vitest to 5.1.0, Vite to 8.3.5 and the affected selector
parser to 6.1.5. Kept PostgreSQL-compatible identifiers accepted with Zod's `guid`
validator: switching to the stricter v4 `uuid` validator would reject existing
seed/demo identifiers. Five additional route regressions cover identifiers,
defaults, malformed requests and limits. All 35 unit tests and TypeScript pass.
Production audit: zero findings. Full development audit: 19 moderate findings
remain in glob/minimatch and Capacitor's xcode/uuid tooling chains; zero high or
critical findings. Forced major transitive overrides were not applied because
older consumers use incompatible callable/export APIs.

Real local deletion verification passed with PostgreSQL 17 Alpine, GoTrue
2.180.0, PostgREST 13.0.5 and Storage API 1.19.3 (not the storage stub). The full
Supabase PostgreSQL image exceeded the Docker layer-store disk limit, so the
smaller PostgreSQL image was initialized with local Supabase roles/auth helpers.
All 45 application migrations applied successfully. Local Storage role grants
and a PostgREST schema-cache reload were necessary for this disposable stack;
no hosted database was mutated.

The new browser regression creates two disposable users, uploads nested files
as each authenticated owner, inserts personal rows, then deletes one account
through Settings. It verifies removal of the auth user, profile, stats,
submission and owned upload; the old auth session is rejected, Settings returns
to sign-in, and the other account/file survives. This proves local service
integration, not production Stripe cancellation, APNs/FCM or store acceptance.
The regression refuses to run destructive setup against non-local hosts.
Playwright optionally accepts PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH for an installed
Chromium binary, while retaining its normal managed browser default.

Production operations and store publication remain deferred. No current signed
release, credential/security setting change or legal acceptance was performed.

After fixing the disposable stack setup, the complete browser suite passed:
37/37 tests, including auth redirects, real deletion, lesson practice,
pronunciation, quiz, teacher create/edit/delete, page smoke checks, and actual
file submission. Earlier setup-related failures were rerun successfully; none
were skipped in this final run.
The final Next.js production build also passed. It reports two existing lint
warnings (SessionRoom effect dependency and AttachmentViewer image optimization),
without build or type errors.

## November 5 Assessment Builder reconciliation

Integrated default branch 852c7db3fb8f935ed699eaa5b678d73a68ff60e3 into the existing
candidate, preserving the Assessment Builder UI/navigation and grading database
error handling. Git combined the changes without conflicts. Kept the existing
teacher-selector and storage-stub fixes unchanged; no duplicate selector fix.
The two new assessment ID validators use `guid()` to retain the candidate's
PostgreSQL identifier compatibility after its Zod 4 upgrade. Six focused server
action regressions cover legacy and version-4 identifiers, malformed IDs,
teacher membership, assessment classroom ownership and answer-key write errors.
Local validation: 47 unit tests, four storage HTTP tests and TypeScript passed.
The earlier 37-browser-test result belongs to 894d294; hosted browser/build/native
checks must be assessed on the new merge commit, not inferred from that result.
No deployment, PR merge, signing or release-readiness claim is made here.

## November 10 reconciliation

Reconciled this review branch with default commit
`6946591` without dropping the new assessment import, monitoring, accommodations,
True/False and Numeric question support. Resolved the question-schema conflict
by preserving those kinds and the existing Zod 4 PostgreSQL GUID compatibility.
Applied that compatibility to the newly added assessment autosave/teacher
schemas as well. Regression coverage preserves True/False/numeric answer keys,
accepts existing PostgreSQL IDs on autosave and rejects malformed IDs before DB
access. This does not merge the separate assessment-integrity PR #64; its schema
and grading/tutoring changes still require their own coordinated review.

Validation: locked install, TypeScript, 53 Vitest tests and 4 storage tests pass.
Local E2E and native platform validation remain separate requirements: Docker,
Android SDK and Xcode are not present in this executor. No hosted database,
signed build, store submission, live deletion or production configuration was
changed. This reconciliation is not evidence of a deployed release.
