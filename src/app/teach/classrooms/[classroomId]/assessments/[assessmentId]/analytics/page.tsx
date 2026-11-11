import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment analytics" };

export default async function AssessmentAnalyticsPage(
  props: { params: Promise<{ classroomId: string; assessmentId: string }> },
) {
  const { classroomId, assessmentId } = await props.params;
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: isTeacher } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!isTeacher) notFound();

  const { data: assessment } = await supabase
    .from("assessments").select("id,title,classroom_id").eq("id", assessmentId).maybeSingle();
  if (!assessment || assessment.classroom_id !== classroomId) notFound();

  const [{ data: questions }, { data: attempts }] = await Promise.all([
    supabase.from("assessment_questions").select("id,position,prompt,points").eq("assessment_id", assessmentId).order("position"),
    supabase.from("assessment_attempts").select("id,score,max_score,status").eq("assessment_id", assessmentId).neq("status", "in_progress"),
  ]);

  const attemptIds = (attempts ?? []).map((a: any) => a.id);
  const { data: responses } = attemptIds.length
    ? await supabase.from("assessment_responses").select("question_id,is_correct").in("attempt_id", attemptIds)
    : { data: [] as any[] };

  // Class average (over scored attempts).
  const scored = (attempts ?? []).filter((a: any) => a.max_score && a.max_score > 0);
  const classAvg = scored.length
    ? Math.round((scored.reduce((s: number, a: any) => s + a.score / a.max_score, 0) / scored.length) * 100)
    : null;

  // Per-question difficulty.
  const byQ = new Map<string, { answered: number; correct: number }>();
  for (const r of (responses ?? []) as any[]) {
    const e = byQ.get(r.question_id) ?? { answered: 0, correct: 0 };
    e.answered++;
    if (r.is_correct === true) e.correct++;
    byQ.set(r.question_id, e);
  }

  return (
    <div className="space-y-5">
      <header>
        <Link href={`/teach/classrooms/${classroomId}/assessments/${assessmentId}/results`} className="text-sm text-brand-500">← Results</Link>
        <h1 className="mt-1 text-2xl font-bold">Analytics — {assessment.title}</h1>
        <p className="text-sm text-ink-500">{(attempts ?? []).length} attempts</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs uppercase tracking-wider text-ink-500">Class average</p>
          <p className="text-3xl font-extrabold text-brand-600">{classAvg != null ? `${classAvg}%` : "—"}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wider text-ink-500">Attempts</p>
          <p className="text-3xl font-extrabold">{(attempts ?? []).length}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wider text-ink-500">Questions</p>
          <p className="text-3xl font-extrabold">{(questions ?? []).length}</p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Question difficulty</h2>
        <ul className="space-y-2">
          {(questions ?? []).map((q: any, i: number) => {
            const e = byQ.get(q.id) ?? { answered: 0, correct: 0 };
            const pct = e.answered ? Math.round((e.correct / e.answered) * 100) : null;
            const hard = pct != null && pct < 50;
            return (
              <li key={q.id} className="card">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">{i + 1}. {q.prompt}</p>
                  <span className={`shrink-0 text-sm font-semibold ${hard ? "text-red-600" : pct != null && pct >= 80 ? "text-green-600" : "text-ink-600"}`}>
                    {pct != null ? `${pct}% correct` : "no answers"}
                  </span>
                </div>
                {pct != null && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div className={`h-full rounded-full ${hard ? "bg-red-400" : pct >= 80 ? "bg-green-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                <p className="mt-1 text-[11px] text-ink-400">{e.correct}/{e.answered} correct{hard ? " · consider reviewing this topic in class" : ""}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
