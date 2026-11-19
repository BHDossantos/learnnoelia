# Publishing Noelia to the App Store & Google Play

LearnNoelia currently uses a Capacitor shell loading the hosted Next.js site.
Hosted deployments update the content loaded by that shell. They do not establish
native-device compatibility or store approval. Capacitor documents `server.url`
as a live-reload configuration not intended for production; retain this as an
explicit architecture/review risk until a bundled-client strategy is validated.
See `MOBILE_VALIDATION.md` for evidence and remaining release checks.

This doc is the full path. Some steps only you can do (they need paid developer
accounts, a Mac, and signing identities). Each is marked **[you]** or **[code]**.

---

## 0. What it costs / needs (one-time)

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | **$99/yr** | Required to submit to the App Store. |
| Google Play Developer | **$25 once** | Required to submit to Google Play. |
| A Mac with Xcode | — | **iOS builds require macOS + Xcode.** Android builds work on any OS with Android Studio. No Mac? Use a Mac-in-cloud service (MacStadium, or a rented CI Mac). |
| App icons + screenshots | — | We have icons; the stores need marketing screenshots (see §5). |
| Privacy policy URL | — | Both stores require one. Noelia already exposes `/privacy` — confirm it's complete. |

---

## 1. The foundation (already in the repo) **[code — done]**

- `capacitor.config.ts` — appId `com.learnnoelia.app`, loads `https://learnnoelia.com`, dark splash + status bar.
- `@capacitor/core`, `ios`, `android`, `splash-screen`, `status-bar`, `app` in `package.json`.
- `mobile/www/index.html` — offline fallback shell.
- npm scripts: `cap:add:ios`, `cap:add:android`, `cap:sync`, `cap:open:ios`, `cap:open:android`.
- PWA manifest + icons already in `public/` (also makes the site installable from the browser).

## 2. Generate the native projects **[you, once]**

On your machine (Node installed, repo cloned):

```bash
npm ci
npm run cap:add:android      # any OS
npm run cap:add:ios          # macOS only
npm run cap:sync             # copies config + web assets into both
```

This creates `/android` and `/ios` folders (git-ignored — they're regenerated
per machine). Re-run `npm run cap:sync` after changing `capacitor.config.ts` or
adding plugins.

## 3. Android build & upload **[you]**

1. Install **Android Studio**. `npm run cap:open:android`.
2. Set the app icon (Android Studio → res → New Image Asset) from `public/icon-512.png`.
3. Create a **signing key** (`keytool`) and configure `android/app/build.gradle` release signing — keep the keystore safe; you need it for every future update.
4. Build → **Generate Signed Bundle** → `.aab`.
5. In **Google Play Console** ($25 account): create the app, fill the listing (§5), upload the `.aab` to the Internal testing track first, then Production.

## 4. iOS build & upload **[you, needs a Mac]**

1. `npm run cap:open:ios` opens Xcode.
2. In Xcode: set the Bundle Identifier to `com.learnnoelia.app`, pick your Apple
   Developer team, set the app icon from `public/icon-512.png`.
3. Product → Archive → Distribute App → App Store Connect.
4. In **App Store Connect**: create the app, fill the listing (§5), attach the
   build, submit for review.

## 5. Store listings (both) **[you — I can draft all copy]**

Each store needs: app name (**Noelia**), subtitle/short description, full
description, keywords, category (**Education**), a privacy policy URL, a support
URL, and screenshots (iPhone 6.7" + 5.5", iPad, and several Android sizes).
Ask me and I'll write the descriptions, keywords, and a screenshot shot-list.

## 6. ⚠️ The one thing that will get you rejected: in-app purchases

Both stores require that **digital subscriptions sold inside the app** use their
billing (Apple StoreKit / Google Play Billing) — **not** Stripe/web checkout —
and they take **15–30%**. Noelia's subscriptions are Stripe-on-web. Options:

- **A. "Login-only" app (fastest, recommended for v1).** The app has **no
  purchase UI at all**: users subscribe on the website, then log in on the app to
  use what they paid for. Apple allows this for multi-platform services; do not
  show upgrade buttons or link to web checkout from inside the app. This requires review against current store and regional policies before submission.
- **B. Native in-app purchases.** Add StoreKit / Play Billing (via a Capacitor
  IAP plugin), map products to Noelia tiers, and reconcile entitlements with
  Supabase. Full 15–30% cut and meaningfully more work — do this later if mobile
  conversion justifies it.

We should ship **A** first. That means: when the app runs inside the native
shell, hide the pricing/upgrade CTAs. I can implement that detection
(`Capacitor.isNativePlatform()`) when you're ready.

## 7. Apple "minimum functionality" (Guideline 4.2)

Apple sometimes rejects apps that are "just a website." LearnNoelia includes interactive functionality (adaptive lessons, in-browser code/SQL
labs, offline-aware PWA, push-capable). To be safe we add native touches —
splash, status bar, native share, and push notifications — before submitting.
The current config already includes splash + status bar.

## 8. Updates after launch

- **Content / features / bug fixes:** just deploy to Vercel — the apps pick it up
  on next launch. No resubmission.
- **Native changes (icon, plugins, permissions, OS target):** `npm run cap:sync`,
  rebuild, resubmit.

---

### What I (Claude) can do next, on request
- Draft all store copy (titles, descriptions, keywords) + a screenshot shot-list.
- Implement native-shell detection to hide in-app purchase CTAs (Option A).
- Add native push notifications (Capacitor Push) wired to the existing web-push backend.
- Add a GitHub Actions job to build the Android `.aab` automatically.

### What needs you
- Apple ($99/yr) and Google ($25) developer accounts.
- A Mac (or cloud Mac) for the iOS build.
- Generating signing keys and doing the final upload/submit in each console.

## Installable PWA (ship-now mobile app)

Alongside the Capacitor shell, Noelia is a full installable PWA, so anyone can
add it to their home screen today with no app store:

- **Manifest** (`public/manifest.json`): standalone display, maskable icon,
  app shortcuts (Learn / Coach / Practice), screenshots, categories.
- **Service worker** (`public/sw.js`): web-push notifications + offline support
  (network-first navigations, cached immutable assets, `/offline` fallback).
- **In-app install prompt** (`src/components/InstallPrompt.tsx`): captures
  `beforeinstallprompt` on Android/desktop Chrome/Edge (one-tap install) and
  shows the Add to Home Screen hint on iOS Safari. It hides automatically when
  already installed, inside the Capacitor shell (`NoeliaApp` UA), or once
  dismissed.
- **iOS standalone polish**: `appleWebApp` metadata (status bar, title) and
  `viewport-fit=cover` + CSS `env(safe-area-inset-*)` so the bottom nav clears
  the home indicator.

The native store apps (Capacitor) remain the path for App Store / Play Store
distribution; the PWA covers instant install everywhere else.
