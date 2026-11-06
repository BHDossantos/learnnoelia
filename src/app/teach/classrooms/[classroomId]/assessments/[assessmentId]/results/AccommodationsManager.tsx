"use client";
import { useState, useTransition } from "react";
import { setAccommodation } from "../../actions";

type Student = { id: string; name: string; extraTimePct: number };

export function AccommodationsManager({
  classroomId, assessmentId, students,
}: {
  classroomId: string;
  assessmentId: string;
  students: Student[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Accommodations</h2>
      <p className="text-xs text-ink-500">Give a student extra time (percent). Applied to their timer when they take it.</p>
      <ul className="card divide-y divide-black/5">
        {students.map((s) => (
          <Row key={s.id} classroomId={classroomId} assessmentId={assessmentId} student={s} />
        ))}
        {students.length === 0 && <li className="py-2 text-sm text-ink-500">No students in this class yet.</li>}
      </ul>
    </section>
  );
}

function Row({
  classroomId, assessmentId, student,
}: {
  classroomId: string;
  assessmentId: string;
  student: Student;
}) {
  const [pct, setPct] = useState(student.extraTimePct);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      try {
        await setAccommodation({ classroomId, assessmentId, studentId: student.id, extraTimePct: Number(pct) || 0 });
        setSaved(true); setTimeout(() => setSaved(false), 1200);
      } catch { /* ignore */ }
    });
  }
  return (
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <span className="min-w-0 truncate">{student.name}</span>
      <span className="flex shrink-0 items-center gap-1">
        <input type="number" min={0} max={300} value={pct} onChange={(e) => setPct(Number(e.target.value) || 0)} className="w-16 rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
        <span className="text-xs text-ink-500">%</span>
        <button onClick={save} disabled={pending} className="btn-ghost px-2 py-1 text-xs">{saved ? "✓" : "Save"}</button>
      </span>
    </li>
  );
}
