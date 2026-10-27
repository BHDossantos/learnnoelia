"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  assignCoursesToClassroom,
  unassignCourseFromClassroom,
} from "@/app/school/actions";

type AssignedCourse = {
  id: string;
  title: string;
  subject: string | null;
  kind: string;
  assignmentCount: number;
};
type AssignableCourse = { id: string; title: string; school: string; subject: string | null };

// Friendly labels + icons for the catalog subjects (matches /learn).
const SCHOOL_META: Record<string, { label: string; icon: string }> = {
  language: { label: "Languages", icon: "🌍" },
  math: { label: "Mathematics", icon: "➗" },
  science: { label: "Science", icon: "🔬" },
  technology: { label: "Technology", icon: "💻" },
  business: { label: "Business", icon: "💼" },
  humanities: { label: "Humanities", icon: "🏛️" },
  arts: { label: "Arts", icon: "🎨" },
  other: { label: "Other", icon: "📚" },
};
const SCHOOL_ORDER = ["language", "math", "science", "technology", "business", "humanities", "arts", "other"];

export function ClassroomCourses({
  orgId, classroomId, canManage, assigned, assignable,
}: {
  orgId: string;
  classroomId: string;
  canManage: boolean;
  assigned: AssignedCourse[];
  assignable: AssignableCourse[];
}) {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Group the assignable catalog by subject, filtered by the search box.
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const bySchool = new Map<string, AssignableCourse[]>();
    for (const c of assignable) {
      if (q && !c.title.toLowerCase().includes(q) && !(c.subject ?? "").toLowerCase().includes(q)) continue;
      const key = SCHOOL_META[c.school] ? c.school : "other";
      if (!bySchool.has(key)) bySchool.set(key, []);
      bySchool.get(key)!.push(c);
    }
    return SCHOOL_ORDER.filter((s) => bySchool.has(s)).map((s) => ({
      school: s,
      meta: SCHOOL_META[s],
      courses: bySchool.get(s)!.sort((a, b) => a.title.localeCompare(b.title)),
    }));
  }, [assignable, filter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleGroup(school: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(school) ? next.delete(school) : next.add(school);
      return next;
    });
  }

  function assign() {
    if (selected.size === 0) return;
    setError(null);
    start(async () => {
      try {
        await assignCoursesToClassroom({ orgId, classroomId, courseIds: [...selected] });
        setSelected(new Set());
        setPicking(false);
      } catch (e: any) {
        setError(e?.message ?? "Could not assign courses");
      }
    });
  }
  function remove(courseId: string) {
    setError(null);
    start(async () => {
      try {
        await unassignCourseFromClassroom({ orgId, classroomId, courseId });
      } catch (e: any) {
        setError(e?.message ?? "failed");
      }
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          Courses ({assigned.length})
        </h2>
        {canManage && !picking && (
          <button onClick={() => setPicking(true)} className="btn-primary text-xs">
            + Add from catalog
          </button>
        )}
      </div>

      {assigned.length === 0 ? (
        <p className="card text-sm text-ink-500">
          No courses assigned yet. Pick courses from the catalog below and every student
          in this classroom is auto-enrolled.
        </p>
      ) : (
        <ul className="space-y-2">
          {assigned.map((c) => (
            <li key={c.id} className="card flex items-center justify-between">
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="text-xs text-ink-500 capitalize">
                  {c.kind}
                  {c.subject ? ` · ${c.subject}` : ""} · {c.assignmentCount} assignment
                  {c.assignmentCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/teach/courses/${c.id}`} className="btn-ghost px-2 py-1 text-xs">
                  Open
                </Link>
                {canManage && (
                  <button onClick={() => remove(c.id)} disabled={pending} className="text-xs text-red-600">
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Catalog picker: tick the courses to teach, grouped by subject. */}
      {canManage && picking && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Choose courses from the catalog</p>
            <button onClick={() => { setPicking(false); setSelected(new Set()); }} className="text-xs text-ink-500">
              Cancel
            </button>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search courses (e.g. history, biology, Spanish)…"
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:bg-white/5"
          />

          {groups.length === 0 ? (
            <p className="text-xs text-ink-500">No courses match — try a different search.</p>
          ) : (
            <div className="max-h-[22rem] space-y-1 overflow-y-auto pr-1">
              {groups.map((g) => {
                const open = openGroups.has(g.school) || filter.trim().length > 0;
                const pickedInGroup = g.courses.filter((c) => selected.has(c.id)).length;
                return (
                  <div key={g.school} className="rounded-xl border border-black/5">
                    <button
                      onClick={() => toggleGroup(g.school)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
                    >
                      <span>{g.meta.icon} {g.meta.label} <span className="text-xs text-ink-500">({g.courses.length})</span></span>
                      <span className="text-xs text-ink-500">
                        {pickedInGroup > 0 ? `${pickedInGroup} selected · ` : ""}{open ? "▾" : "▸"}
                      </span>
                    </button>
                    {open && (
                      <ul className="space-y-0.5 px-2 pb-2">
                        {g.courses.map((c) => (
                          <li key={c.id}>
                            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/5">
                              <input
                                type="checkbox"
                                checked={selected.has(c.id)}
                                onChange={() => toggle(c.id)}
                                className="h-4 w-4"
                              />
                              <span className="flex-1">{c.title}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-black/5 pt-2">
            <span className="text-xs text-ink-500">{selected.size} selected</span>
            <button onClick={assign} disabled={pending || selected.size === 0} className="btn-primary text-sm">
              {pending ? "Assigning…" : `Assign ${selected.size || ""} & enroll students`}
            </button>
          </div>
          <p className="text-[11px] text-ink-400">
            Want to build your own instead?{" "}
            <Link href="/teach/courses/new" className="text-brand-500">Create a course →</Link>
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
