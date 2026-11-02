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
