"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type NavLabels = Dictionary["app"]["nav"];

// Desktop sidebar (per the product design mock — dark panel). Mobile keeps
// BottomNav; this renders only at lg+. Labels come from the active locale so
// the shell is translated for signed-in users too.
const MAIN: { href: string; key: keyof NavLabels; icon: string }[] = [
  { href: "/", key: "home", icon: "🏠" },
  { href: "/learn", key: "myLearning", icon: "📚" },
  { href: "/calendar", key: "calendar", icon: "🗓️" },
  { href: "/inbox", key: "messages", icon: "✉️" },
  { href: "/profile", key: "progress", icon: "📈" },
  { href: "/grades", key: "grades", icon: "📊" },
  { href: "/community", key: "community", icon: "👥" },
  { href: "/learn?scope=all", key: "library", icon: "🗂️" },
];

const SHORTCUTS: { href: string; key: keyof NavLabels; icon: string }[] = [
  { href: "/notes", key: "notes", icon: "📝" },
  { href: "/review", key: "flashcards", icon: "🔁" },
  { href: "/practice", key: "practice", icon: "💬" },
  { href: "/coach", key: "tutor", icon: "🎯" },
];

const WORKSPACES: { href: string; key: keyof NavLabels; icon: string }[] = [
  { href: "/teach", key: "teach", icon: "🎓" },
  { href: "/school", key: "school", icon: "🏫" },
  { href: "/family", key: "family", icon: "👨‍👩‍👧" },
];

function Item({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${
        active
          ? "bg-white/10 font-semibold text-white"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-brand-500" />
      )}
      <span className="text-base leading-none">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40">
      {children}
    </p>
  );
}

export function SideNav({
  userName,
  version,
  unreadCount,
  labels,
}: {
  userName?: string;
  version?: string;
  unreadCount?: number;
  labels: NavLabels;
}) {
  const pathname = usePathname();
  // usePathname has no search params, so "/learn?scope=all" (Library) never
  // matches — by design, /learn is claimed by My Learning only.
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && !href.includes("?") && pathname.startsWith(href));

  return (
    <aside aria-label="Primary" className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-1 overflow-y-auto border-r border-white/10 bg-[#0e1022] px-3 py-5 lg:flex">
      <Link href="/" className="mb-4 flex items-center gap-2 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 font-bold text-white">
          N
        </span>
        <span className="text-lg font-bold text-white">Noelia</span>
      </Link>

      {MAIN.map((it) => (
        <Item
          key={it.href}
          href={it.href}
          icon={it.icon}
          label={labels[it.key]}
          active={isActive(it.href)}
          badge={it.href === "/inbox" ? unreadCount : undefined}
        />
      ))}

      <SectionLabel>{labels.shortcuts}</SectionLabel>
      {SHORTCUTS.map((it) => (
        <Item key={it.href} href={it.href} icon={it.icon} label={labels[it.key]} active={isActive(it.href)} />
      ))}

      <SectionLabel>{labels.workspaces}</SectionLabel>
      {WORKSPACES.map((it) => (
        <Item key={it.href} href={it.href} icon={it.icon} label={labels[it.key]} active={isActive(it.href)} />
      ))}
      {/* Guided demo spans all roles — literal label (no per-locale key needed). */}
      <Item href="/demo" icon="🎬" label="Guided demo" active={isActive("/demo")} />

      <div className="mt-auto pt-4">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          ⚙️ {labels.settings}
        </Link>
        {version && (
          <p className="px-3 pt-1 text-[9px] tracking-wide text-white/30">build {version}</p>
        )}
        {userName && (
          <Link
            href="/profile"
            className="mt-1 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-sm font-bold text-white">
              {userName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-white">{userName}</span>
              <span className="block text-[11px] text-white/50">{labels.viewProfile}</span>
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}
