"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UI_LOCALES, LOCALE_META, LOCALE_COOKIE, type UiLocale } from "@/lib/i18n/config";

/**
 * Interface-language picker. Writes the choice to the NEXT_LOCALE cookie
 * (read server-side on the next render) and refreshes so the page comes back
 * translated. Small, dependency-free dropdown.
 */
export function LanguageSwitcher({ current }: { current: UiLocale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // router.refresh() keeps this component mounted, so clear the pending flag
  // once the new locale arrives; otherwise the picker stays disabled for good.
  useEffect(() => {
    setPending(false);
  }, [current]);

  function choose(locale: UiLocale) {
    setOpen(false);
    if (locale === current) return;
    // 1 year, site-wide.
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    setPending(true);
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-500 transition hover:text-brand-500 disabled:opacity-50"
      >
        <span aria-hidden className="text-base leading-none">{LOCALE_META[current].flag}</span>
        <span className="hidden font-medium sm:inline">{LOCALE_META[current].native}</span>
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" className="opacity-60">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-black/5 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-ink-900"
        >
          {UI_LOCALES.map((loc) => (
            <li key={loc}>
              <button
                type="button"
                role="option"
                aria-selected={loc === current}
                onClick={() => choose(loc)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/10 ${
                  loc === current ? "font-semibold text-brand-600" : "text-ink-700 dark:text-white/80"
                }`}
              >
                <span aria-hidden className="text-base leading-none">{LOCALE_META[loc].flag}</span>
                <span>{LOCALE_META[loc].native}</span>
                {loc === current && (
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" className="ml-auto text-brand-500">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
