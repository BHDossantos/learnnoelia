import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ReviewClient } from "./ReviewClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review attempt" };

export default async function AttemptReviewPage(
  props: { params: Promise<{ classroomId: string; assessmentId: string; attemptId: string }> },
) {
  const { classroomId, assessmentId, attemptId } = await props.params;
  await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: isTeacher } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!isTeacher) notFound();

  const [{ data: attempt }, { data: a2 }] = await Promise.all([
    supabase
      .from("assessment_attempts")
      .select("id,assessment_id,status,score,max_score,published,student:profiles(display_name)")
      .eq("id", attemptId)
      .maybeSingle(),
    supabase.from("assessments").select("anonymous_grading").eq("id", assessmentId).maybeSingle(),
  ]);
  if (!attempt || attempt.assessment_id !== assessmentId) notFound();
  const anon = !!(a2 as any)?.anonymous_grading;

  // Teacher may read answer keys (RLS); students cannot.
  const { data: questions } = await supabase
    .from("assessment_questions")
    .select("id,position,kind,prompt,options,points,assessment_answer_keys(correct_index,correct_indices,correct_text,correct_number,number_tolerance,rubric)")
    .eq("assessment_id", assessmentId)
    .order("position");
  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("question_id,response,points_awarded,is_correct,feedback_md")
    .eq("attempt_id", attemptId);
  const respByQ = new Map((responses ?? []).map((r: any) => [r.question_id, r]));

  const items = (questions ?? []).map((q: any) => {
    const key = Array.isArray(q.assessment_answer_keys) ? q.assessment_answer_keys[0] : q.assessment_answer_keys;
    const r = respByQ.get(q.id);
    const opts: string[] = Array.isArray(q.options) ? q.options : [];
    const answerText = (() => {
      const v = r?.response;
      if (!v) return "(no answer)";
      if (q.kind === "mcq" || q.kind === "truefalse") return opts[v.index] ?? `#${v.index}`;
      if (q.kind === "multi") return (v.indices ?? []).map((i: number) => opts[i] ?? `#${i}`).join(", ");
      if (q.kind === "numeric") return v.value != null ? String(v.value) : "(no answer)";
      return v.text ?? "(no answer)";
    })();
    const correctText = (() => {
      if (!key) return "";
      if (q.kind === "mcq" || q.kind === "truefalse") return opts[key.correct_index] ?? "";
      if (q.kind === "multi") return (key.correct_indices ?? []).map((i: number) => opts[i] ?? `#${i}`).join(", ");
      if (q.kind === "short") return key.correct_text ?? "";
      if (q.kind === "numeric") return key.correct_number != null ? `${key.correct_number}${key.number_tolerance ? ` ± ${key.number_tolerance}` : ""}` : "";
      return key.rubric ?? "";
    })();
    return {
      id: q.id,
      kind: q.kind as "mcq" | "multi" | "short" | "written",
      prompt: q.prompt,
      points: q.points,
      answerText,
      correctText,
      pointsAwarded: r?.points_awarded ?? null,
      isCorrect: r?.is_correct ?? null,
      feedback: r?.feedback_md ?? "",
    };
  });

  return (
    <div className="space-y-4">
      <Link href={`/teach/classrooms/${classroomId}/assessments/${assessmentId}/results`} className="text-sm text-brand-500">← Results</Link>
      <header>
        <h1 className="text-2xl font-bold">{anon ? "Anonymous student" : ((attempt as any).student?.display_name ?? "Student")}</h1>
        <p className="text-sm text-ink-500">
          {attempt.status === "submitted" ? "Needs review" : attempt.published ? "Published" : "Graded"} ·{" "}
          {attempt.score ?? 0}/{attempt.max_score ?? 0} pts
        </p>
      </header>

      <ReviewClient
        classroomId={classroomId}
        assessmentId={assessmentId}
        attemptId={attemptId}
        items={items}
        published={!!attempt.published}
      />
    </div>
  );
}
