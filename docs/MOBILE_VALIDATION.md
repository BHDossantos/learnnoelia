# Mobile validation and release evidence

Audited 2026-10-21 against `e5e434537679a5a03b404d92f377cb89bba732ea`.

## What this app is

LearnNoelia uses Capacitor 8 to wrap the hosted Next.js application at
`https://learnnoelia.com`, with app identifier `com.learnnoelia.app`. It is not
an Expo React Native application. The root `eas.json` is not proof of an Expo
build pipeline and should not be copied as the build recipe for this app.
Native projects are generated from the lockfile, not committed.

## Automated validation

- The existing `CI` workflow checks TypeScript, a production web build, and
  the Playwright suite. It remains unchanged. The new `Unit and Type Checks`
  workflow runs TypeScript and unit tests on pushes and pull requests without
  needing any application credentials.
- `LearnNoelia Native Builds` runs for native-related pull requests, pushes to
  the active default branch, and manual dispatch. Previously its push trigger
  watched only `brand/learnnoelia-mobile`.
- Android compiles an installable debug APK and unsigned release AAB, plus
  Android lint. Download artifacts from the run for the exact commit.
- iOS compiles and packages a simulator `.app` without signing. Capacitor 8
  uses Swift Package Manager by default, so no CocoaPods step is needed.
- Validation uses no production credentials and does not submit or release.
  A green build demonstrates compilation, not physical-device behavior or
  store approval. The debug APK is not a production binary; the simulator app
  cannot be installed on a physical iPhone.

Reproduce web checks with `npm ci`, `npm run typecheck`, `npm test`, and
`npm run build` using the documented local devstack environment. Native checks
require Android SDK/JDK 21 or macOS/Xcode respectively. See the workflow for
exact generation and compilation commands.

## Existing signed-build evidence

These are historical successful uploads, not claims about the current branch
or production-store availability:

- [Google Play internal upload, 2026-10-09](https://github.com/BHDossantos/learnnoelia/actions/runs/37953690928): Android signing, AAB build, and Play upload succeeded; iOS was skipped.
- [TestFlight upload, 2026-10-09](https://github.com/BHDossantos/learnnoelia/actions/runs/37972966192): iOS signing, archive/export, and upload succeeded; Android was skipped.
- [Web CI, 2026-10-15](https://github.com/BHDossantos/learnnoelia/actions/runs/38762757424) passed on the audited default-branch commit.

The separate `Mobile release (Play + TestFlight)` workflow remains manual and
unchanged. It needs existing signing/store credentials. No credential values
were inspected or changed, and no release was triggered for this audit.

## Before paid distribution

- [ ] Verify the latest candidate, not only the historical uploaded build, on
  TestFlight and Play internal testing; record the build number and commit.
- [ ] Test signup/login, session restoration, password reset/deep links,
  lessons, gradebook, camera/microphone permissions, offline startup,
  reconnect, accessibility, and background/resume on iPhone and Android.
- [ ] Confirm generated app icons/splash assets and permission descriptions
  in the actual native artifacts. Web/PWA icons alone do not prove this.
- [ ] Test every purchase/upgrade entry point in the native shell. Review the
  chosen login-only business model against current store and regional rules;
  no CI result guarantees billing compliance or store acceptance.
- [ ] Complete privacy/data-safety declarations, account deletion, reviewer
  access, screenshots, content ratings, and store metadata in both consoles.
- [ ] Close applicable product/QA/privacy items in `LAUNCH_READINESS.md`.

References: [Capacitor 8 upgrade guide](https://capacitorjs.com/docs/updating/8-0),
[Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/),
[Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738).
