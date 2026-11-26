import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { SideNav } from "@/components/SideNav";
import { PageBeacon } from "@/components/PageBeacon";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { supabaseServer } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://learnnoelia.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: { default: "Noelia — Learn anything, out loud.", template: "%s — Noelia" },
  description:
    "The learning platform for languages and beyond — math, science, technology, and business. 150+ courses, active lessons, spoken practice, and live instructors, all in one app.",
  manifest: "/manifest.json",
  applicationName: "Noelia",
  appleWebApp: {
    capable: true,
    title: "Noelia",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    url: SITE_URL,
    title: "Noelia — Learn anything, out loud.",
    description:
      "Languages, math, science, technology, and business — 150+ courses in one app. Free to start.",
    siteName: "Noelia",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Noelia — Learn anything, out loud." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Noelia — Learn anything, out loud.",
    description:
      "Languages, math, science, technology, and business — 150+ courses in one app. Free to start.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#3b6cf6",
};

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-base font-extrabold text-white">
        N
      </span>
      <span className="text-lg font-bold tracking-tight">Noelia</span>
    </Link>
  );
}

// Runs before paint inside the native shell (Capacitor appends "NoeliaApp" to
// the UA): marks <html> so CSS can hide web-only purchase CTAs. The App Store /
// Play Store forbid selling digital subscriptions outside their billing, so the
// mobile apps are login-only — people subscribe on the web. See docs/MOBILE_APP.md.
const NATIVE_DETECT =
  "try{if(/NoeliaApp/.test(navigator.userAgent)){document.documentElement.classList.add('native-app')}}catch(e){}";

// Visitors get a clean marketing shell (wide pages, no app tabs); signed-in
// users get the app shell (phone-width column + bottom navigation).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let authed = false;
  let userName: string | undefined;
  let unreadCount = 0;
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = await supabaseServer();
      const { data: { user } } = await supabase.auth.getUser();
      authed = !!user;
      if (user) {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        userName =
          (typeof meta.full_name === "string" && meta.full_name) ||
          (typeof meta.name === "string" && meta.name) ||
          user.email?.split("@")[0] ||
          undefined;
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null);
        unreadCount = count ?? 0;
      }
    }
  } catch {
    // Treat as signed out; middleware still guards protected routes.
  }

  if (!authed) {
    const { locale, t } = await getI18n();
    return (
      <html lang={locale}>
        <body className="font-sans">
          <script dangerouslySetInnerHTML={{ __html: NATIVE_DETECT }} />
          <a href="#main" className="skip-link">Skip to content</a>
          <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Logo />
            <nav className="flex items-center gap-2 text-sm sm:gap-4">
              <Link href="/#how" className="hidden text-ink-500 hover:text-brand-500 sm:block">
                {t.nav.how}
              </Link>
              <Link href="/pricing" className="web-only text-ink-500 hover:text-brand-500">
                {t.nav.pricing}
              </Link>
              <LanguageSwitcher current={locale} />
              <Link href="/sign-in" className="btn-primary px-4 py-2 text-sm">
                {t.nav.signIn}
              </Link>
            </nav>
          </header>
          <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">{children}</main>
          {/* Legal links on every signed-out page, so privacy, terms and the
              web account-deletion page are reachable without signing in (app
              store reviews check for this). Pricing stays web-only: the native
              app must not surface purchase entry points (guideline 3.1.1). */}
          <footer className="mx-auto w-full max-w-6xl px-4 pb-10 text-center text-xs text-ink-500 sm:px-6">
            <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <Link href="/pricing" className="web-only underline underline-offset-2 hover:text-brand-500">
                {t.cta.pricing}
              </Link>
              <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-brand-500">
                {t.cta.privacy}
              </Link>
              <Link href="/legal/terms" className="underline underline-offset-2 hover:text-brand-500">
                {t.cta.terms}
              </Link>
              <Link href="/legal/delete-account" className="underline underline-offset-2 hover:text-brand-500">
                {t.cta.deleteAccount}
              </Link>
            </nav>
          </footer>
          <PageBeacon />
          <InstallPrompt />
        </body>
      </html>
    );
  }

  const { locale, t } = await getI18n();
  const nav = t.app.nav;
  return (
    <html lang={locale}>
      <body className="font-sans">
        <script dangerouslySetInnerHTML={{ __html: NATIVE_DETECT }} />
        <a href="#main" className="skip-link">Skip to content</a>
        <SideNav
          userName={userName}
          version={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"}
          unreadCount={unreadCount}
          labels={nav}
        />
        <main id="main" className="min-h-screen px-4 pb-24 pt-6 lg:pl-64 lg:pr-8 lg:pb-10">
          <div className="mx-auto max-w-screen-sm lg:max-w-4xl">
            {/* Mobile top bar — the desktop sidebar replaces it at lg+ */}
            <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center lg:hidden">
              <Logo />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-500">
                <Link href="/inbox" className="hover:text-brand-500">{nav.inbox}</Link>
                <Link href="/grades" className="hover:text-brand-500">{nav.grades}</Link>
                <Link href="/family" className="hover:text-brand-500">{nav.family}</Link>
                <Link href="/teach" className="hover:text-brand-500">{nav.teach}</Link>
                <Link href="/school" className="hover:text-brand-500">{nav.school}</Link>
                <LanguageSwitcher current={locale} />
              </div>
            </div>
            {/* Desktop language switcher — top-right of the content column */}
            <div className="mb-4 hidden justify-end lg:flex">
              <LanguageSwitcher current={locale} />
            </div>
            {children}
          </div>
        </main>
        <BottomNav labels={nav} />
        <PageBeacon />
          <InstallPrompt />
      </body>
    </html>
  );
}
