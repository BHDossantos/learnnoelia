import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { startAttempt } from "../actions";
import { AttemptClient } from "./AttemptClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment" };

export default async function AttemptPage(props: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await props.params;
  const user = await requireOnboardedUser();
  const supabase = await supabaseServer();

  // RLS: a student can read this only if it's published and they're in the class.
  const { data: assessment } = await supabase
    .from("assessments")
    .select("id,title,description,status,total_points,time_limit_minutes")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!assessment) notFound();

  const { data: attempt } = await supabase
    .from("assessment_attempts")
    .select("id,status,score,max_score,published,started_at")
    .eq("assessment_id", assessmentId)
    .eq("student_id", user.id)
    .maybeSingle();

  // Questions WITHOUT answer keys (RLS blocks keys for students entirely).
  const { data: questions } = await supabase
    .from("assessment_questions")
    .select("id,position,kind,prompt,options,points")
    .eq("assessment_id", assessmentId)
    .order("position");

  const back = (
    <Link href="/assessments" className="text-sm text-brand-500">← Assessments</Link>
  );

  // Not started yet.
  if (!attempt) {
    return (
      <div className="space-y-4">
        {back}
        <h1 className="text-2xl font-bold">{assessment.title}</h1>
        {assessment.description && <p className="text-sm text-ink-600">{assessment.description}</p>}
        <div className="card space-y-2 text-sm text-ink-600">
          <p>{(questions ?? []).length} questions · {assessment.total_points} points
            {assessment.time_limit_minutes ? ` · ${assessment.time_limit_minutes} minute limit` : " · no time limit"}</p>
          <p className="text-ink-500">Once you start{assessment.time_limit_minutes ? ", the timer begins and" : ","} your answers save automatically.</p>
        </div>
        <form action={startAttempt}>
          <input type="hidden" name="assessmentId" value={assessmentId} />
          <button className="btn-primary">Start assessment</button>
        </form>
      </div>
    );
  }

  // Submitted / graded.
  if (attempt.status !== "in_progress") {
    const pct = attempt.published && attempt.max_score
      ? Math.round((attempt.score / attempt.max_score) * 100)
      : null;
    return (
      <div className="space-y-4">
        {back}
        <h1 className="text-2xl font-bold">{assessment.title}</h1>
        <div className="card space-y-2 text-center">
          {attempt.published && pct != null ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Your score</p>
              <p className="text-5xl font-extrabold text-brand-600">{pct}%</p>
              <p className="text-sm text-ink-500">{attempt.score} of {attempt.max_score} points</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">Submitted ✓</p>
              <p className="text-sm text-ink-500">
                {attempt.status === "submitted"
                  ? "Your written answers are awaiting teacher review. Your score will appear here once it's published."
                  : "Awaiting your teacher to publish results."}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // In progress — load existing responses and hand off to the client.
  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("question_id,response")
    .eq("attempt_id", attempt.id);

  return (
    <AttemptClient
      assessmentId={assessmentId}
      attemptId={attempt.id}
      title={assessment.title}
      timeLimitMinutes={assessment.time_limit_minutes}
      startedAt={attempt.started_at}
      questions={(questions ?? []).map((q: any) => ({
        id: q.id, kind: q.kind, prompt: q.prompt, options: q.options ?? null, points: q.points,
      }))}
      initialResponses={Object.fromEntries((responses ?? []).map((r: any) => [r.question_id, r.response]))}
    />
  );
}
