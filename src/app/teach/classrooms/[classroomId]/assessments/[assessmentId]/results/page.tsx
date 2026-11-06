import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

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
    .from("assessments").select("id,title,total_points,classroom_id").eq("id", assessmentId).maybeSingle();
  if (!assessment || assessment.classroom_id !== classroomId) notFound();

  const { data: attempts } = await supabase
    .from("assessment_attempts")
    .select("id,status,score,max_score,published,submitted_at,student:profiles(display_name)")
    .eq("assessment_id", assessmentId)
    .order("submitted_at", { ascending: true });

  const rows = attempts ?? [];
  const needsReview = rows.filter((a: any) => a.status === "submitted").length;

  return (
    <div className="space-y-5">
      <header>
        <Link href={`/teach/classrooms/${classroomId}/assessments/${assessmentId}`} className="text-sm text-brand-500">← Builder</Link>
        <h1 className="mt-1 text-2xl font-bold">Results — {assessment.title}</h1>
        <p className="text-sm text-ink-500">
          {rows.length} attempts{needsReview > 0 ? ` · ${needsReview} need review` : ""}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="card text-sm text-ink-500">No one has taken this assessment yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a: any) => {
            const st = STATUS[a.status] ?? { label: a.status, cls: "bg-black/5 text-ink-600" };
            const pct = a.max_score ? Math.round((a.score / a.max_score) * 100) : null;
            return (
              <li key={a.id}>
                <Link
                  href={`/teach/classrooms/${classroomId}/assessments/${assessmentId}/results/${a.id}`}
                  className="card flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.student?.display_name ?? "Student"}</p>
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
    </div>
  );
}
