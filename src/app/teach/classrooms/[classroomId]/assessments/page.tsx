import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { createAssessment } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessments" };

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-black/5 text-ink-600",
  published: "bg-green-100 text-green-700",
  closed: "bg-amber-50 text-amber-700",
};

export default async function AssessmentsPage(props: { params: Promise<{ classroomId: string }> }) {
  const { classroomId } = await props.params;
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: isTeacher } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!isTeacher) notFound();

  const { data: classroom } = await supabase
    .from("classrooms").select("id,name,org_id").eq("id", classroomId).maybeSingle();
  if (!classroom) notFound();

  const { data: assessments } = await supabase
    .from("assessments")
    .select("id,title,status,total_points,time_limit_minutes,created_at,assessment_questions(id)")
    .eq("classroom_id", classroomId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-5">
      <header>
        <Link href={`/school/${classroom.org_id}/classrooms/${classroomId}`} className="text-sm text-brand-500">← Classroom</Link>
        <h1 className="mt-1 text-2xl font-bold">Assessments — {classroom.name}</h1>
        <p className="text-sm text-ink-500">Create exams with secure, server-graded questions. Answer keys never reach the student.</p>
      </header>

      <section className="card space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">New assessment</p>
        <form action={createAssessment} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="classroomId" value={classroomId} />
          <label className="flex-1 text-sm">
            <span className="block text-xs text-ink-500">Title</span>
            <input name="title" required placeholder="e.g. Spanish A2 — Unit 1 Test" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-ink-500">Time limit (min)</span>
            <input name="timeLimit" type="number" min={0} placeholder="none" className="w-28 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5" />
          </label>
          <button className="btn-primary text-sm">Create</button>
        </form>
      </section>

      {(assessments ?? []).length === 0 ? (
        <p className="card text-sm text-ink-500">No assessments yet. Create one above.</p>
      ) : (
        <ul className="space-y-2">
          {(assessments ?? []).map((a: any) => (
            <li key={a.id}>
              <Link href={`/teach/classrooms/${classroomId}/assessments/${a.id}`} className="card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.title}</p>
                  <p className="text-xs text-ink-500">
                    {(a.assessment_questions ?? []).length} questions · {a.total_points} pts
                    {a.time_limit_minutes ? ` · ${a.time_limit_minutes} min` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[a.status] ?? ""}`}>
                  {a.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
