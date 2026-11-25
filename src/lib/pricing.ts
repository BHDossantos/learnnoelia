// Single source of truth for pricing & packaging (see docs/PRICING.md).
// Display data only — no secrets. Stripe price IDs live in env vars, keyed by
// `${tier}_${interval}` (e.g. STRIPE_SILVER_MONTHLY_PRICE_ID); a tier's checkout
// is enabled only when its price ID is configured, otherwise it shows "coming
// soon" (prices are still displayed — they're the plan, not a false claim).

export type TierId = "bronze" | "silver" | "gold" | "platinum";
export type Interval = "monthly" | "annual";
export type Currency = "usd" | "eur";

export const CURRENCY_SYMBOL: Record<Currency, string> = { usd: "$", eur: "€" };

// Eurozone members (countries that actually use the euro) → price in EUR.
// Everyone else defaults to USD. Matched against Vercel's x-vercel-ip-country.
export const EUROZONE = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT",
  "LU", "MT", "NL", "PT", "SK", "SI", "ES", "AD", "MC", "SM", "VA",
]);

export function currencyForCountry(country: string | null | undefined): Currency {
  return country && EUROZONE.has(country.toUpperCase()) ? "eur" : "usd";
}

/** Swap the "$" placeholders in a display string for the active symbol. */
export function withCurrency(text: string, currency: Currency): string {
  return currency === "usd" ? text : text.split("$").join(CURRENCY_SYMBOL[currency]);
}

export type Tier = {
  id: TierId;
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  highlighted?: boolean;
  badge?: string;
  /** Short feature lines for the card. */
  features: string[];
  /** "Everything in <lower tier>, plus:" framing shown above features. */
  inheritsFrom?: string;
};

export const TIERS: Tier[] = [
  {
    id: "bronze",
    name: "Bronze",
    tagline: "Self-Study",
    monthly: 8.99,
    annual: 79,
    features: [
      "Every course: 6 languages, 5 schools",
      "Spaced-repetition reviews & progress tracking",
      "Streaks, XP, achievements, leaderboard",
      "Offline lessons, no ads",
    ],
  },
  {
    id: "silver",
    name: "Silver",
    tagline: "Coached",
    monthly: 16.99,
    annual: 149,
    highlighted: true,
    badge: "Most popular",
    inheritsFrom: "Bronze",
    features: [
      "Coach chat — hints & explanations (fair use ~50/day)",
      "System roleplay — real scenario practice",
      "Word-by-word pronunciation scoring",
      "Instant grading & real-time translate",
    ],
  },
  {
    id: "gold",
    name: "Gold",
    tagline: "Accelerate",
    monthly: 34.99,
    annual: 299,
    inheritsFrom: "Silver",
    features: [
      "60 live-tutor minutes / month included",
      "Certificates of completion",
      "Higher coach limits (~200/day)",
      "Family sharing — up to 3 profiles",
      "Priority support",
    ],
  },
  {
    id: "platinum",
    name: "Platinum",
    tagline: "Mastery",
    monthly: 79.99,
    annual: 699,
    inheritsFrom: "Gold",
    features: [
      "240 live-tutor minutes / month included",
      "Unlimited coach (fair use)",
      "Verified certificates",
      "Family sharing — up to 6 profiles",
      "1:1 onboarding & priority tutor booking",
    ],
  },
];

/**
 * Env var holding the Stripe price ID for a tier + interval + currency.
 * USD keeps the original names (e.g. STRIPE_SILVER_MONTHLY_PRICE_ID); EUR adds
 * an _EUR segment (STRIPE_SILVER_MONTHLY_EUR_PRICE_ID).
 */
export function priceEnvKey(tier: TierId, interval: Interval, currency: Currency): string {
  const cur = currency === "eur" ? "_EUR" : "";
  return `STRIPE_${tier.toUpperCase()}_${interval.toUpperCase()}${cur}_PRICE_ID`;
}

/**
 * Resolve the configured Stripe price ID for a tier+interval+currency, if any.
 * Back-compat: USD Silver monthly falls back to the original
 * STRIPE_PREMIUM_PRICE_ID so an existing single-price setup keeps working.
 */
export function resolvePriceId(tier: TierId, interval: Interval, currency: Currency = "usd"): string | undefined {
  const direct = process.env[priceEnvKey(tier, interval, currency)];
  if (direct) return direct;
  if (currency === "usd" && tier === "silver" && interval === "monthly") {
    return process.env.STRIPE_PREMIUM_PRICE_ID;
  }
  return undefined;
}

/** Which tiers currently have a live checkout in this currency (gates buttons). */
export function liveTierMap(currency: Currency = "usd"): Record<TierId, { monthly: boolean; annual: boolean }> {
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;
  const map = {} as Record<TierId, { monthly: boolean; annual: boolean }>;
  for (const t of TIERS) {
    map[t.id] = {
      monthly: hasStripe && !!resolvePriceId(t.id, "monthly", currency),
      annual: hasStripe && !!resolvePriceId(t.id, "annual", currency),
    };
  }
  return map;
}

// ---- Live tutoring (à-la-carte) ----
export const TUTORING = {
  instant: [
    { label: "Standard tutor", perMin: 1.25, perHr: 75 },
    { label: "Expert / certified", perMin: 1.75, perHr: 105 },
  ],
  bundles: [
    { minutes: 60, price: 59 },
    { minutes: 180, price: 149 },
    { minutes: 600, price: 429 },
  ],
  freeIntroMinutes: 10,
  tutorPayoutPct: 70,
};

// ---- Schools / institutions ----
export const SCHOOL_PLANS = [
  {
    id: "classroom",
    name: "Classroom",
    price: "$499",
    unit: "/ year",
    best: "One teacher, tutor, or microschool",
    features: [
      "Up to 40 students",
      "Teacher dashboard & rostering",
      "Assignments + auto-grading",
      "1 live class meeting room",
      "Family / parent visibility",
    ],
  },
  {
    id: "school",
    name: "School",
    price: "$15",
    unit: "/ student / year",
    best: "A whole school (50+ students)",
    highlighted: true,
    features: [
      "Volume pricing: $12 (100+), $9 (500+), $7 (1,000+)",
      "Everything in Classroom, at scale",
      "Admin console & bulk provisioning",
      "Live class meetings for every class",
      "Standards-alignment reporting (CEFR / Common Core)",
    ],
  },
  {
    id: "district",
    name: "District / Enterprise",
    price: "Custom",
    unit: "",
    best: "Multiple schools or a district",
    features: [
      "SSO (Google / Clever / SAML)",
      "SIS / LMS integration",
      "Dedicated success manager & SLA",
      "Custom content & data export",
      "Verified certificates included",
    ],
  },
] as const;
