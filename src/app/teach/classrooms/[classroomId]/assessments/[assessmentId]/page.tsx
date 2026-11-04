import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { AssessmentQuestionForm } from "./AssessmentQuestionForm";
import { deleteQuestion, setStatus, deleteAssessment } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Build assessment" };

const KIND_LABEL: Record<string, string> = {
  mcq: "Multiple choice", multi: "Multi-select", short: "Short answer", written: "Written",
};

export default async function AssessmentBuilderPage(
  props: { params: Promise<{ classroomId: string; assessmentId: string }> },
) {
  const { classroomId, assessmentId } = await props.params;
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: isTeacher } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!isTeacher) notFound();

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id,title,status,total_points,time_limit_minutes,classroom_id")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!assessment || assessment.classroom_id !== classroomId) notFound();

  // Teachers may read the answer keys (students cannot — enforced by RLS).
  const { data: questions } = await supabase
    .from("assessment_questions")
    .select("id,position,kind,prompt,options,points,assessment_answer_keys(correct_index,correct_indices,correct_text,rubric)")
    .eq("assessment_id", assessmentId)
    .order("position");

  function correctLabel(q: any): string {
    const k = q.assessment_answer_keys;
    const key = Array.isArray(k) ? k[0] : k;
    if (!key) return "—";
    const opts: string[] = Array.isArray(q.options) ? q.options : [];
    if (q.kind === "mcq") return opts[key.correct_index] ?? `#${key.correct_index}`;
    if (q.kind === "multi") return (key.correct_indices ?? []).map((i: number) => opts[i] ?? `#${i}`).join(", ");
    if (q.kind === "short") return key.correct_text ?? "—";
    if (q.kind === "written") return "Rubric-graded";
    return "—";
  }

  const qs = questions ?? [];
  const published = assessment.status === "published";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/teach/classrooms/${classroomId}/assessments`} className="text-sm text-brand-500">← Assessments</Link>
          <h1 className="mt-1 text-2xl font-bold">{assessment.title}</h1>
          <p className="text-sm text-ink-500">
            {qs.length} questions · {assessment.total_points} pts
            {assessment.time_limit_minutes ? ` · ${assessment.time_limit_minutes} min` : " · untimed"} ·{" "}
            <span className="font-medium capitalize">{assessment.status}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!published ? (
            <form action={setStatus}>
              <input type="hidden" name="classroomId" value={classroomId} />
              <input type="hidden" name="assessmentId" value={assessmentId} />
              <input type="hidden" name="status" value="published" />
              <button className="btn-primary text-sm">Publish to class</button>
            </form>
          ) : (
            <form action={setStatus}>
              <input type="hidden" name="classroomId" value={classroomId} />
              <input type="hidden" name="assessmentId" value={assessmentId} />
              <input type="hidden" name="status" value="closed" />
              <button className="btn-ghost text-sm">Close</button>
            </form>
          )}
        </div>
      </header>

      {published && (
        <p className="card border-green-300 bg-green-50 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10">
          Published — students in this class can now take it. Edit with care; changing questions after students start can affect their attempts.
        </p>
      )}

      {/* Question list (with answer keys — teacher only). */}
      {qs.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Questions</p>
          <ol className="space-y-2">
            {qs.map((q: any, i: number) => (
              <li key={q.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i + 1}. {q.prompt}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{KIND_LABEL[q.kind] ?? q.kind} · {q.points} pts</p>
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-ink-600">
                        {q.options.map((o: string, j: number) => (
                          <li key={j}>{String.fromCharCode(65 + j)}. {o}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1 text-xs"><span className="text-ink-500">Answer key:</span> <span className="font-medium text-green-700">{correctLabel(q)}</span></p>
                  </div>
                  <form action={deleteQuestion}>
                    <input type="hidden" name="classroomId" value={classroomId} />
                    <input type="hidden" name="assessmentId" value={assessmentId} />
                    <input type="hidden" name="questionId" value={q.id} />
                    <button className="shrink-0 text-xs text-ink-400 hover:text-red-600" aria-label="Delete question">✕</button>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <AssessmentQuestionForm classroomId={classroomId} assessmentId={assessmentId} />

      <form action={deleteAssessment} className="pt-2">
        <input type="hidden" name="classroomId" value={classroomId} />
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <button className="text-xs text-ink-400 hover:text-red-600">Delete this assessment</button>
      </form>
    </div>
  );
}
