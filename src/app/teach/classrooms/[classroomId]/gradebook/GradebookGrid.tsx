"use client";
import { useMemo, useState } from "react";
import {
  computeFinalGrade,
  filterGradebookStudents,
  type GradeCategory,
  type GradeItem,
  type SchemeBand,
} from "@/lib/gradebook";
import { setEntry } from "./actions";

type Student = { id: string; name: string };
type GridItem = GradeItem & { published?: boolean };

export function GradebookGrid({
  classroomId,
  students,
  items,
  categories,
  mode,
  scheme,
  initialEntries,
}: {
  classroomId: string;
  students: Student[];
  items: GridItem[];
  categories: GradeCategory[];
  mode: "points" | "weighted";
  scheme?: SchemeBand[];
  initialEntries: { grade_item_id: string; student_id: string; points: number | null }[];
}) {
  // points keyed by `${studentId}:${itemId}` as strings for the inputs.
  const [points, setPoints] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const e of initialEntries) m[`${e.student_id}:${e.grade_item_id}`] = e.points == null ? "" : String(e.points);
    return m;
  });
  const [savedPoints, setSavedPoints] = useState(points);
  const [query, setQuery] = useState("");
  const [ungradedOnly, setUngradedOnly] = useState(false);
  const visibleStudents = filterGradebookStudents(students, items, savedPoints, query, ungradedOnly);
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({});

  const finals = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeFinalGrade>> = {};
    for (const s of students) {
      const entries = items.map((it) => {
        const v = points[`${s.id}:${it.id}`];
        return { grade_item_id: it.id, points: v === "" || v == null ? null : Number(v) };
      });
      out[s.id] = computeFinalGrade({ mode, categories, items, entries, scheme });
    }
    return out;
  }, [points, students, items, categories, mode, scheme]);

  async function commit(studentId: string, item: GridItem, raw: string) {
    const key = `${studentId}:${item.id}`;
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value != null && (Number.isNaN(value) || value < 0)) {
      setSaving((s) => ({ ...s, [key]: "error" }));
      return;
    }
    setSaving((s) => ({ ...s, [key]: "saving" }));
    try {
      await setEntry({ classroomId, gradeItemId: item.id, studentId, points: value });
      setSavedPoints((p) => ({ ...p, [key]: raw }));
      setSaving((s) => ({ ...s, [key]: "saved" }));
      setTimeout(() => setSaving((s) => { const n = { ...s }; delete n[key]; return n; }), 1200);
    } catch {
      setSaving((s) => ({ ...s, [key]: "error" }));
    }
  }

  return (
    <section className="card overflow-x-auto p-0">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <label>Find student <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded border px-2 py-1" /></label>
        <label><input type="checkbox" checked={ungradedOnly} onChange={(e) => setUngradedOnly(e.target.checked)} /> Has ungraded work</label>
        <span role="status">{visibleStudents.length} of {students.length} students</span>
        <button type="button" onClick={() => { setQuery(""); setUngradedOnly(false); }}>Clear filters</button>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left">
            <th className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold dark:bg-[#0b1020]">Student</th>
            {items.map((it) => (
              <th key={it.id} className="px-2 py-2 text-center font-medium">
                <div className="whitespace-nowrap">{it.name}{!it.published && <span className="ml-1 text-[10px] text-ink-400">(draft)</span>}</div>
                <div className="text-[10px] font-normal text-ink-400">/ {it.max_points}</div>
              </th>
            ))}
            <th className="px-3 py-2 text-center font-semibold">Final</th>
          </tr>
        </thead>
        <tbody>
          {visibleStudents.map((s) => {
            const f = finals[s.id];
            return (
              <tr key={s.id} className="border-b border-black/5">
                <td className="sticky left-0 z-10 max-w-[10rem] truncate bg-white px-3 py-1.5 font-medium dark:bg-[#0b1020]">{s.name}</td>
                {items.map((it) => {
                  const key = `${s.id}:${it.id}`;
                  const st = saving[key];
                  return (
                    <td key={it.id} className="px-1 py-1 text-center">
                      <input
                        inputMode="decimal"
                        value={points[key] ?? ""}
                        onChange={(e) => setPoints((p) => ({ ...p, [key]: e.target.value }))}
                        onBlur={(e) => commit(s.id, it, e.target.value)}
                        aria-label={`${s.name} — ${it.name}`}
                        className={`w-14 rounded-md border px-1 py-1 text-center text-sm ${
                          st === "error" ? "border-red-400" : st === "saved" ? "border-green-400" : "border-black/10"
                        } bg-white dark:bg-white/5`}
                        placeholder="—"
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-center font-semibold">
                  {f.percent == null ? (
                    <span className="text-ink-400">—</span>
                  ) : (
                    <span>
                      {f.letter ?? ""} <span className="text-ink-500">{f.percent}%</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {visibleStudents.length === 0 && <tr><td colSpan={items.length + 2} className="p-4 text-center">No students match these filters.</td></tr>}
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-ink-400">
        Type a score and tab/click away to save. Leave blank for ungraded. Final updates live.
      </p>
    </section>
  );
}
