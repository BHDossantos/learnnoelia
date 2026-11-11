"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ensureInviteCode, linkStudent, unlinkStudent, followDemoStudent } from "./actions";

type LinkedStudent = { id: string; name: string };

export function FamilyClient({
  initialCode, linkedStudents, role = null,
}: {
  initialCode: string | null;
  linkedStudents: LinkedStudent[];
  role?: string | null;
}) {
  const isParent = role === "parent";
  const [code, setCode] = useState(initialCode);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reveal() {
    start(async () => {
      try { setCode(await ensureInviteCode()); }
      catch (e: any) { setError(e?.message ?? "failed"); }
    });
  }

  function link() {
    setError(null);
    start(async () => {
      try { await linkStudent({ code: entry }); setEntry(""); }
      catch (e: any) { setError(e?.message ?? "failed"); }
    });
  }

  const inviteSection = (
    <section className="card space-y-2">
      <h2 className="font-semibold">Invite a parent</h2>
      <p className="text-sm text-ink-500">
        {isParent
          ? "Have a child of your own on Noelia? Share this code so they can follow you too."
          : "Share this code with your parent or guardian. They enter it on their own account to follow your progress and grades."}
      </p>
      {code ? (
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-brand-700">
          {code}
        </p>
      ) : (
        <button onClick={reveal} disabled={pending} className="btn-primary w-full">
          {pending ? "…" : "Generate my invite code"}
        </button>
      )}
    </section>
  );

  const followSection = (
    <section className="card space-y-2">
      <h2 className="font-semibold">Follow your child</h2>
      <p className="text-sm text-ink-500">
        Enter the 6-character invite code your child generated on their own account
        (under <span className="font-medium">Family → Invite a parent</span>). Once linked,
        you&apos;ll see their grades, progress, and assignments here.
      </p>
      <div className="flex gap-2">
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABC123"
          className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 tracking-[0.2em]"
        />
        <button onClick={link} disabled={pending || entry.length !== 6} className="btn-primary">
          Link
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Family</h1>
        <p className="text-sm text-ink-500">
          {isParent
            ? "Link your child's account to follow their progress, grades, and assignments."
            : "Link a parent or guardian so they can follow your progress, grades, and assignments."}
        </p>
      </header>

      {/* Parents must enter the child's code first — make that unmistakable, and
          surface it prominently until at least one child is linked. */}
      {isParent && linkedStudents.length === 0 && (
        <div className="card border-brand-500/30 bg-brand-50/70 dark:bg-brand-500/10">
          <p className="text-sm font-semibold text-ink-900">👋 One step to get started</p>
          <p className="mt-1 text-sm text-ink-700">
            To see your child&apos;s grades and progress, you need their <span className="font-semibold">invite code</span>.
            Ask them to open Noelia → <span className="font-medium">Family</span> → <span className="font-medium">Invite a parent</span>,
            then enter the 6-character code below.
          </p>
          <div className="mt-3 border-t border-brand-500/20 pt-3">
            <p className="text-xs text-ink-600">Just want to look around first?</p>
            <form action={followDemoStudent} className="mt-1.5">
              <button type="submit" className="btn-ghost border border-black/10 text-sm dark:border-white/10">
                👨‍🎓 Follow a demo student (John Doe)
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Parents lead with "Follow your child"; students lead with "Invite a parent". */}
      {isParent ? (
        <>
          {followSection}
          {inviteSection}
        </>
      ) : (
        <>
          {inviteSection}
          {followSection}
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          Students you follow
        </h2>
        {linkedStudents.length === 0 ? (
          <p className="card text-sm text-ink-500">Not following anyone yet.</p>
        ) : (
          <ul className="space-y-2">
            {linkedStudents.map((s) => (
              <li key={s.id} className="card flex items-center justify-between">
                <Link href={`/parent/${s.id}`} className="font-medium text-brand-600">
                  {s.name}
                </Link>
                <button
                  onClick={() => start(() => unlinkStudent({ studentId: s.id }))}
                  className="text-xs text-ink-500"
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
