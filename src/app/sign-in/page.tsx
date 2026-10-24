"use client";
import { useEffect, useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { requestMagicLink } from "@/app/sign-in/actions";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

type Mode = "magic" | "password";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("magic");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [oauthBusy, setOauthBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  // Surface errors handed back by /auth/callback (?error=...) — previously
  // these were silently swallowed and sign-in failures looked like a bounce.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    // Supabase can also report errors in the URL fragment, which never
    // reaches the server — read both.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const err =
      qs.get("error_description") ??
      qs.get("error") ??
      hash.get("error_description") ??
      hash.get("error");
    if (err) setError(`Sign-in failed: ${err}`);
  }, []);

  function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const res = await requestMagicLink({ email });
        if (res.ok) setSent(true);
        else setError(res.error ?? "Could not send the link");
      } catch {
        // Most common cause: the page is from an older deployment than the
        // server (we deploy often). A refresh re-syncs them.
        setError("The site was just updated — refresh this page and try again.");
      }
    });
  }

  async function google() {
    setError(null);
    setOauthBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(
        /not enabled|unsupported/i.test(error.message)
          ? "Google sign-in isn't enabled on this deployment yet."
          : error.message,
      );
      setOauthBusy(false);
    }
    // On success the browser navigates away to Google.
  }

  // Email + password sign-in. No email round-trip, so it works even when
  // transactional email isn't set up yet (and gives App Store reviewers a login).
  async function passwordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setPwBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
      setError(/invalid login/i.test(error.message) ? "Wrong email or password." : error.message);
      setPwBusy(false);
      return;
    }
    // Full navigation so the server picks up the new session cookie.
    window.location.assign("/");
  }

  async function passwordSignUp() {
    setError(null);
    setInfo(null);
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setPwBusy(true);
    const { data, error } = await supabaseBrowser().auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setPwBusy(false);
      return;
    }
    if (data.session) {
      // Email confirmation is off — we're signed in immediately.
      window.location.assign("/");
      return;
    }
    // Email confirmation is on: the account exists but needs a verification email.
    setInfo("Account created. If email confirmation is on, check your inbox to confirm before signing in.");
    setPwBusy(false);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pt-8">
      <h1 className="text-2xl font-bold">Sign in</h1>

      {GOOGLE_ENABLED && (
      <button
        type="button"
        onClick={google}
        disabled={oauthBusy}
        data-testid="google-signin"
        className="btn-ghost w-full border border-black/10 dark:border-white/10"
      >
        {oauthBusy ? "Redirecting…" : (
          <span className="inline-flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.02c2.2-2 3.5-5 3.5-8.6z"/>
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2-6.7-4.9l-.14.01-3.6 2.8-.05.13C3.5 21.3 7.5 24 12 24z"/>
              <path fill="#FBBC05" d="M5.3 14.5c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2l-.01-.15-3.7-2.9-.12.06C.6 8.7 0 10.3 0 12.3s.6 3.6 1.5 5.1l3.8-2.9z"/>
              <path fill="#EB4335" d="M12 4.9c2.2 0 3.7.9 4.5 1.7l3.3-3.2C17.9 1.3 15.2 0 12 0 7.5 0 3.5 2.7 1.5 6.6l3.8 2.9c1-2.8 3.6-4.6 6.7-4.6z"/>
            </svg>
            Continue with Google
          </span>
        )}
      </button>
      )}

      <div className="flex items-center gap-3 text-xs text-ink-500">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        {mode === "magic" ? "with email" : "with a password"}
        <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
      </div>

      {mode === "magic" ? (
        sent ? (
          <p className="card">Check your email for the magic link.</p>
        ) : (
          <form onSubmit={handle} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3"
            />
            <button className="btn-primary w-full" type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send magic link"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        )
      ) : (
        <form onSubmit={passwordSignIn} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3"
          />
          <button className="btn-primary w-full" type="submit" disabled={pwBusy}>
            {pwBusy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={passwordSignUp}
            disabled={pwBusy}
            className="btn-ghost w-full border border-black/10 dark:border-white/10"
          >
            Create an account
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-ink-600">{info}</p>}
        </form>
      )}

      <button
        type="button"
        onClick={() => { setMode(mode === "magic" ? "password" : "magic"); setError(null); setInfo(null); setSent(false); }}
        className="w-full text-center text-xs text-brand-500 underline"
      >
        {mode === "magic" ? "Use a password instead" : "Email me a magic link instead"}
      </button>

      <p className="pt-2 text-center text-xs text-ink-500">
        By continuing you agree to our{" "}
        <a href="/legal/terms" className="underline">Terms</a> and{" "}
        <a href="/legal/privacy" className="underline">Privacy Policy</a>.
      </p>
    </div>
  );
}
