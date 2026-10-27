import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeachHome() {
  const user = await requireUser();
  const supabase = await supabaseServer();

  const [{ data: courses }, { data: needsReview }, { data: myClassRows }] = await Promise.all([
    supabase
      .from("courses")
      .select("id,title,subject,kind,language,cefr_level")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("id,submitted_at,assignment:assignments!inner(title,teacher_id)")
      .eq("assignment.teacher_id", user.id)
      .eq("status", "graded")
      .order("submitted_at", { ascending: false })
      .limit(10),
    // Classes this teacher runs — the home for assigning catalog courses,
    // the gradebook, and grading papers in context.
    supabase
      .from("classroom_members")
      .select("classroom:classrooms(id,name,org_id)")
      .eq("user_id", user.id)
      .eq("role", "teacher"),
  ]);

  const myClasses = (myClassRows ?? [])
    .map((r: any) => r.classroom)
    .filter(Boolean) as { id: string; name: string; org_id: string }[];

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Teach</h1>
        <Link href="/teach/courses/new" className="btn-ghost text-sm">+ Build a course</Link>
      </header>

      {/* Your classes: where you assign catalog courses, open the gradebook, and
          grade papers. This is the main teacher workspace. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Your classes</h2>
        {myClasses.length === 0 ? (
          <div className="card text-sm text-ink-500">
            You don&apos;t have a class yet. Create one in your{" "}
            <Link href="/school" className="text-brand-500">school / organization</Link>, then assign
            courses from the catalog and add students.
          </div>
        ) : (
          <ul className="space-y-2">
            {myClasses.map((c) => (
              <li key={c.id} className="card flex items-center justify-between gap-2">
                <Link href={`/school/${c.org_id}/classrooms/${c.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-ink-500">Assign courses · roster · announcements</p>
                </Link>
                <div className="flex shrink-0 gap-1.5">
                  <Link href={`/teach/classrooms/${c.id}/gradebook`} className="btn-ghost px-2 py-1 text-xs">📊 Grades</Link>
                  <Link href={`/teach/grade?classroomId=${c.id}`} className="btn-ghost px-2 py-1 text-xs">📸 Grade</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {needsReview && needsReview.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Needs your review ({needsReview.length})
          </h2>
          <ul className="space-y-2">
            {needsReview.map((s: any) => (
              <li key={s.id}>
                <Link href={`/teach/submissions/${s.id}`} className="card flex items-center justify-between">
                  <span className="text-sm">{s.assignment.title}</span>
                  <span className="text-xs text-ink-500">System graded</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          Your courses
        </h2>
        {(courses ?? []).length === 0 ? (
          <div className="card text-sm text-ink-500">
            No courses yet. <Link href="/teach/courses/new" className="text-brand-500">Create your first course →</Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {(courses ?? []).map((c) => (
              <li key={c.id}>
                <Link href={`/teach/courses/${c.id}`} className="card block">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{c.title}</p>
                    {c.cefr_level && (
                      <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                        {c.cefr_level}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-500 capitalize">
                    {c.kind} · {c.subject ?? c.language}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Paper grading lives with your classes above; this is a quick entry for a
          one-off paper outside any class. */}
      <Link href="/teach/grade" className="card flex items-center justify-between gap-3 text-sm text-ink-600">
        <span>📸 Grade a one-off paper (scan, photo, or typed)</span>
        <span className="shrink-0 text-brand-500">→</span>
      </Link>
    </div>
  );
}
