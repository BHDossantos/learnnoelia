import Link from "next/link";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { PricingTiers } from "./PricingTiers";
import {
  liveTierMap, TUTORING, SCHOOL_PLANS,
  CURRENCY_SYMBOL, currencyForCountry, withCurrency,
  type Currency, type TierId,
} from "@/lib/pricing";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default async function PricingPage(props: {
  searchParams: Promise<{ upgraded?: string; cur?: string }>;
}) {
  const { upgraded, cur } = await props.searchParams;

  // Currency by region: eurozone visitors see EUR, everyone else USD.
  // `?cur=eur|usd` overrides for testing.
  const h = await headers();
  const currency: Currency =
    cur === "eur" ? "eur" : cur === "usd" ? "usd"
    : currencyForCountry(h.get("x-vercel-ip-country"));
  const sym = CURRENCY_SYMBOL[currency];
  const live = liveTierMap(currency);

  let signedIn = false;
  let currentTier: TierId | null = null;
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = await supabaseServer();
      const { data: { user } } = await supabase.auth.getUser();
      signedIn = !!user;
      if (user) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("status,tier")
          .eq("user_id", user.id)
          .maybeSingle();
        const activeish = sub?.status === "active" || sub?.status === "trialing";
        if (activeish) currentTier = (sub?.tier as TierId) ?? "silver"; // legacy = silver
      }
    }
  } catch {
    // Signed-out or table not migrated — render the public page.
  }

  return (
    <div className="mx-auto max-w-6xl space-y-14 pb-10 pt-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">Simple pricing, serious learning</h1>
        <p className="mx-auto mt-2 max-w-xl text-ink-500">
          Start free. Learn everything on Bronze. Add coaching, certificates, and live
          tutors as you go.
        </p>
      </header>

      {upgraded && (
        <p className="card border-green-200 bg-green-50 text-center text-sm text-green-700">
          🎉 You&apos;re in! Your subscription is being activated — it can take a few seconds to show.
        </p>
      )}

      {/* Free / Explorer */}
      <section className="mx-auto max-w-2xl">
        <div className="card flex flex-col items-center gap-3 border-brand-500/20 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Free · Explorer</p>
            <p className="mt-1 text-2xl font-extrabold">{sym}0</p>
            <p className="mt-1 text-sm text-ink-500">
              One track at a time, a few lessons a day — try any language or subject, no card needed.
            </p>
          </div>
          <Link href="/sign-in" className="btn-primary shrink-0 px-6 py-3">Start free</Link>
        </div>
      </section>

      {/* Consumer tiers */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-bold">For learners</h2>
        <PricingTiers live={live} currentTier={currentTier} signedIn={signedIn} currency={currency} />
      </section>

      {/* Live tutoring */}
      <section className="mx-auto max-w-4xl space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Live tutoring</h2>
          <p className="mx-auto mt-2 max-w-lg text-ink-500">
            Real instructors over live video. Gold and Platinum include monthly minutes;
            anyone can add more. First {TUTORING.freeIntroMinutes} minutes are free.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Pay as you go</p>
            <ul className="space-y-1.5 text-sm">
              {TUTORING.instant.map((o) => (
                <li key={o.label} className="flex justify-between">
                  <span>{o.label}</span>
                  <span className="font-semibold">{sym}{o.perMin.toFixed(2)}/min <span className="text-ink-500">({sym}{o.perHr}/hr)</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Prepaid bundles (save more)</p>
            <ul className="space-y-1.5 text-sm">
              {TUTORING.bundles.map((b) => (
                <li key={b.minutes} className="flex justify-between">
                  <span>{b.minutes} minutes</span>
                  <span className="font-semibold">
                    {sym}{b.price}
                    <span className="text-ink-500"> ({sym}{(b.price / b.minutes).toFixed(2)}/min)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-center text-xs text-ink-500">
          Tutors keep {TUTORING.tutorPayoutPct}% of every session.{" "}
          <Link href="/tutors" className="underline">Browse tutors →</Link>
        </p>
      </section>

      {/* Schools */}
      <section className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold">For schools &amp; teams</h2>
          <p className="mx-auto mt-2 max-w-lg text-ink-500">
            Dashboards, auto-grading, live classes, and family visibility — from a single
            classroom to a whole district.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {SCHOOL_PLANS.map((p) => (
            <div
              key={p.id}
              className={`card flex flex-col ${
                "highlighted" in p && p.highlighted ? "border-brand-500/50 shadow-lg ring-1 ring-brand-500/20" : ""
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600">{p.name}</p>
              <p className="mt-2">
                <span className="text-3xl font-extrabold">{withCurrency(p.price, currency)}</span>
                {p.unit && <span className="text-sm font-medium text-ink-500"> {p.unit}</span>}
              </p>
              <p className="mt-1 text-sm text-ink-500">{p.best}</p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <span className="text-brand-500">✓</span>
                    <span className="text-ink-700 dark:text-white/80">{withCurrency(f, currency)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={p.id === "district" ? "mailto:support@learnnoelia.com?subject=District%20or%20enterprise%20plan" : "/school"}
                className="btn-ghost mt-4 block w-full text-center text-sm"
              >
                {p.id === "district" ? "Contact sales" : "Get started"}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-ink-500">
          Title I / low-income schools save 40% · Nonprofits 30% · Pilot a classroom free for a term.
        </p>
      </section>

      <p className="text-center text-xs text-ink-500">
        Prices in USD. Every plan includes the full learning engine — the Socratic coach,
        spoken roleplay, instant scoring and grading, and real-time translation — plus 170+
        courses across languages, math, science, technology, business, humanities, and the arts.
      </p>
    </div>
  );
}
