"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createClassroom, setOrgMemberRole } from "@/app/school/actions";

type Member = { user_id: string; role: string; name: string };
type Classroom = { id: string; name: string; grade_level: string | null; term: string | null; size: number };

const ROLES = ["student", "teacher", "admin", "owner"] as const;

export function OrgDashboard({
  orgId, isAdmin, members, classrooms,
}: {
  orgId: string;
  isAdmin: boolean;
  members: Member[];
  classrooms: Classroom[];
}) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [term, setTerm] = useState("");
  const [termFilter, setTermFilter] = useState("all");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Distinct terms present, for the filter control.
  const terms = Array.from(new Set(classrooms.map((c) => c.term).filter(Boolean))) as string[];
  const shownClassrooms =
    termFilter === "all"
      ? classrooms
      : termFilter === "none"
        ? classrooms.filter((c) => !c.term)
        : classrooms.filter((c) => c.term === termFilter);

  function addClassroom() {
    setError(null);
    start(async () => {
      try {
        await createClassroom({ orgId, name, gradeLevel: grade || undefined, term: term || undefined });
        setName("");
        setGrade("");
        setTerm("");
      } catch (e: any) {
        setError(e?.message ?? "failed");
      }
    });
  }

  function changeRole(userId: string, role: string) {
    start(async () => {
      try {
        await setOrgMemberRole({ orgId, userId, role: role as any });
      } catch (e: any) {
        setError(e?.message ?? "failed");
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Classrooms ({shownClassrooms.length}{termFilter !== "all" ? ` of ${classrooms.length}` : ""})
          </h2>
          {terms.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-ink-500">
              Term
              <select
                value={termFilter}
                onChange={(e) => setTermFilter(e.target.value)}
                className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:bg-white/5"
              >
                <option value="all">All terms</option>
                {terms.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="none">No term set</option>
              </select>
            </label>
          )}
        </div>
        {shownClassrooms.length === 0 ? (
          <p className="card text-sm text-ink-500">
            {classrooms.length === 0 ? "No classrooms yet." : "No classrooms in this term."}
          </p>
        ) : (
          <ul className="space-y-2">
            {shownClassrooms.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/school/${orgId}/classrooms/${c.id}`}
                  className="card flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.name}
                      {c.term && (
                        <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 align-middle">
                          {c.term}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-500">
                      {c.grade_level ? `${c.grade_level} · ` : ""}{c.size} members
                    </p>
                  </div>
                  <span className="text-ink-500">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && (
          <div className="card space-y-2">
            <p className="text-sm font-medium">New classroom</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (e.g. Grade 9 — Section A)"
                className="rounded-xl border border-black/10 bg-white px-3 py-2 sm:col-span-3"
              />
              <input
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Grade level (optional)"
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Term (e.g. Fall 2026, Q1)"
                list="term-suggestions"
                className="rounded-xl border border-black/10 bg-white px-3 py-2 sm:col-span-2"
              />
              <datalist id="term-suggestions">
                {["Fall 2026", "Spring 2027", "Q1", "Q2", "Q3", "Q4", "Summer 2027"].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <button
              onClick={addClassroom}
              disabled={pending || name.trim().length < 1}
              className="btn-primary w-full"
            >
              {pending ? "…" : "Create classroom"}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          Members ({members.length})
        </h2>
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.user_id} className="card flex items-center justify-between py-2">
              <span className="text-sm">{m.name}</span>
              {isAdmin ? (
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.user_id, e.target.value)}
                  disabled={pending}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs capitalize"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs capitalize text-ink-500">{m.role}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
