import { MarkingWorkspace } from "@/components/MarkingWorkspace";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Refresh the page periodically while we wait for the AI grade to land.
export const revalidate = 0;

export default async function AssignmentResultPage(
  props: {
    params: Promise<{ assignmentId: string }>;
  }
) {
  const params = await props.params;
  const user = await requireOnboardedUser();
  const supabase = await supabaseServer();

  const { data: a } = await supabase
    .from("assignments")
    .select("id,title,max_score")
    .eq("id", params.assignmentId)
    .single();
  if (!a) notFound();

  const { data: submission } = await supabase
    .from("submissions")
    .select("id,text,status,submitted_at")
    .eq("assignment_id", a.id)
    .eq("student_id", user.id)
    .maybeSingle();
  if (!submission) {
    return (
      <p className="card text-sm">
        No submission yet. <Link href={`/assignments/${a.id}`} className="text-brand-500">Submit →</Link>
      </p>
    );
  }

  const { data: grade } = await supabase
    .from("ai_grades")
    .select("score,max_score,feedback_md,criteria,confidence")
    .eq("submission_id", submission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: review } = await supabase
    .from("teacher_reviews")
    .select("final_score,comments_md,approved_ai,reviewed_at")
    .eq("submission_id", submission.id)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isFinal = !!review;
  const waitingForAI = !grade;

  return (
    <div className="space-y-4">
      {waitingForAI && (
        // Poll while we wait for AI grading.
        (<meta httpEquiv="refresh" content="3" />)
      )}
      <Link href="/assignments" className="text-sm text-brand-500">← Assignments</Link>
      <header>
        <h1 className="text-2xl font-bold">{a.title}</h1>
        <p className="text-xs text-ink-500">
          Submitted {new Date(submission.submitted_at).toLocaleString()} · {submission.status}
        </p>
      </header>
      <MarkingWorkspace kind="submission" targetId={submission.id} readOnly />
      {isFinal ? (
        <section className="card space-y-2">
          <p className="text-xs font-semibold uppercase text-green-700">Final grade</p>
          <p className="text-4xl font-bold">
            {review!.final_score?.toFixed(1)}{" "}
            <span className="text-base text-ink-500">/ {a.max_score}</span>
          </p>
          {review!.comments_md && (
            <p className="whitespace-pre-wrap rounded-lg bg-brand-50 p-2 text-sm text-brand-700">
              {review!.comments_md}
            </p>
          )}
          <p className="text-xs text-ink-500">
            Reviewed by your teacher {new Date(review!.reviewed_at).toLocaleString()}
          </p>
        </section>
      ) : grade ? (
        <section className="card space-y-2">
          <p className="text-xs font-semibold uppercase text-amber-700">
            System-graded — awaiting teacher review
          </p>
          <p className="text-4xl font-bold">
            {grade.score?.toFixed(1)} <span className="text-base text-ink-500">/ {grade.max_score}</span>
          </p>
          {Array.isArray(grade.criteria) && grade.criteria.length > 0 && (
            <ul className="space-y-1 text-sm">
              {grade.criteria.map((c: any, i: number) => (
                <li key={i}>
                  <span className="font-medium">{c.name}:</span> {c.score}/{c.max}
                  <span className="block text-xs text-ink-500">{c.feedback}</span>
                </li>
              ))}
            </ul>
          )}
          {grade.feedback_md && (
            <p className="whitespace-pre-wrap rounded-lg bg-brand-50 p-2 text-sm text-brand-700">
              {grade.feedback_md}
            </p>
          )}
          <p className="text-xs text-ink-500">
            Your teacher will confirm or adjust this grade soon.
          </p>
        </section>
      ) : (
        <section className="card">
          <p className="text-sm">⏳ Grading your submission… this usually takes a few seconds.</p>
        </section>
      )}
      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">Your submission</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{submission.text}</p>
      </details>
      <Link href={`/assignments/${a.id}`} className="btn-ghost block text-center">
        Edit & resubmit
      </Link>
    </div>
  );
}
