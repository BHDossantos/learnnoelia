import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { AccommodationsManager } from "./AccommodationsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment results" };

const STATUS: Record<string, { label: string; cls: string }> = {
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700" },
  submitted: { label: "Needs review", cls: "bg-amber-100 text-amber-800" },
  graded: { label: "Graded", cls: "bg-green-100 text-green-700" },
};

export default async function AssessmentResultsPage(
  props: { params: Promise<{ classroomId: string; assessmentId: string }> },
) {
  const { classroomId, assessmentId } = await props.params;
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: isTeacher } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!isTeacher) notFound();

  const { data: assessment } = await supabase
    .from("assessments").select("id,title,total_points,anonymous_grading,classroom_id").eq("id", assessmentId).maybeSingle();
  if (!assessment || assessment.classroom_id !== classroomId) notFound();
  const anon = !!(assessment as any).anonymous_grading;

  const [{ data: attempts }, { data: roster }, { data: accoms }] = await Promise.all([
    supabase
      .from("assessment_attempts")
      .select("id,status,score,max_score,published,submitted_at,student_id,student:profiles(display_name)")
      .eq("assessment_id", assessmentId)
      .order("submitted_at", { ascending: true }),
    supabase
      .from("classroom_members")
      .select("user_id, profiles(id, display_name)")
      .eq("classroom_id", classroomId)
      .eq("role", "student"),
    supabase.from("assessment_accommodations").select("student_id,extra_time_pct").eq("assessment_id", assessmentId),
  ]);

  const rows = attempts ?? [];
  const needsReview = rows.filter((a: any) => a.status === "submitted").length;

  const accomBy = new Map((accoms ?? []).map((a: any) => [a.student_id, a.extra_time_pct]));
  const students = (roster ?? [])
    .map((r: any) => ({ id: r.profiles?.id as string, name: (r.profiles?.display_name as string) ?? "Student", extraTimePct: accomBy.get(r.profiles?.id) ?? 0 }))
    .filter((s) => s.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/teach/classrooms/${classroomId}/assessments/${assessmentId}`} className="text-sm text-brand-500">← Builder</Link>
          <h1 className="mt-1 text-2xl font-bold">Results — {assessment.title}</h1>
          <p className="text-sm text-ink-500">
            {rows.length} attempts{needsReview > 0 ? ` · ${needsReview} need review` : ""}{anon ? " · anonymous" : ""}
          </p>
        </div>
        <Link href={`/teach/classrooms/${classroomId}/assessments/${assessmentId}/analytics`} className="btn-ghost text-sm">
          📊 Analytics
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="card text-sm text-ink-500">No one has taken this assessment yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a: any, i: number) => {
            const st = STATUS[a.status] ?? { label: a.status, cls: "bg-black/5 text-ink-600" };
            const pct = a.max_score ? Math.round((a.score / a.max_score) * 100) : null;
            return (
              <li key={a.id}>
                <Link
                  href={`/teach/classrooms/${classroomId}/assessments/${assessmentId}/results/${a.id}`}
                  className="card flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{anon ? `Student ${i + 1}` : (a.student?.display_name ?? "Student")}</p>
                    <p className="text-xs text-ink-500">
                      {a.status === "in_progress" ? "Not submitted" : `${a.score ?? 0}/${a.max_score ?? assessment.total_points} pts`}
                      {a.published ? " · published" : ""}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    {pct != null && <span className="text-sm font-semibold text-ink-700">{pct}%</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <AccommodationsManager classroomId={classroomId} assessmentId={assessmentId} students={students} />
    </div>
  );
}
