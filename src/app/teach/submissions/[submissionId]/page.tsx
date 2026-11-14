import { MarkingWorkspace } from "@/components/MarkingWorkspace";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { submitTeacherReview } from "@/app/teach/actions";
import { GradeRunner } from "@/components/GradeRunner";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { IntegrityPanel } from "@/components/IntegrityPanel";

export const dynamic = "force-dynamic";

export default async function TeacherSubmissionPage(
  props: {
    params: Promise<{ submissionId: string }>;
  }
) {
  const params = await props.params;
  const user = await requireUser();
  const supabase = await supabaseServer();

  const { data: s } = await supabase
    .from("submissions")
    .select(`
      id,text,file_url,status,student_id,submitted_at,
      assignment:assignments(id,title,max_score,teacher_id,instructions_md)
    `)
    .eq("id", params.submissionId)
    .single();
  if (!s) notFound();
  const assignment = (s as any).assignment;
  if (!assignment || assignment.teacher_id !== user.id) redirect("/teach");

  const { data: grade } = await supabase
    .from("ai_grades")
    .select("*")
    .eq("submission_id", s.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: existingReview } = await supabase
    .from("teacher_reviews")
    .select("*")
    .eq("submission_id", s.id)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: integrity } = await supabase
    .from("integrity_checks")
    .select("ai_likelihood,ai_reasoning,similarity_max,similar_submission_id")
    .eq("submission_id", s.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-4">
      <Link href={`/teach/assignments/${assignment.id}`} className="text-sm text-brand-500">
        ← {assignment.title}
      </Link>
      <header>
        <h1 className="text-xl font-bold">Submission · Student {s.student_id.slice(0, 8)}</h1>
        <p className="text-xs text-ink-500">
          Submitted {new Date(s.submitted_at).toLocaleString()} · status: {s.status}
        </p>
      </header>

      <details open className="card space-y-2">
        <summary className="cursor-pointer text-sm font-semibold">Student's submission</summary>
        {s.text && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{s.text}</p>
        )}
        {s.file_url && <AttachmentViewer submissionId={s.id} hint={s.file_url} />}
        {!s.text && !s.file_url && <p className="text-sm text-ink-500">(empty)</p>}
      </details>

      <section className="card space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">System grade</h2>
          {!grade && <GradeRunner submissionId={s.id} />}
        </div>
        {grade ? (
          <>
            <p className="text-3xl font-bold">
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
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-brand-50 p-2 text-sm text-brand-700">
                {grade.feedback_md}
              </p>
            )}
            <p className="text-xs text-ink-500">
              Confidence: {(grade.confidence ?? 0).toFixed(2)}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-500">Not graded yet — click Run system grading.</p>
        )}
      </section>

      <IntegrityPanel submissionId={s.id} existing={integrity ?? null} />
      <MarkingWorkspace kind="submission" targetId={s.id} />

      <form action={submitTeacherReview} className="card space-y-2">
        <h2 className="font-semibold">Your review</h2>
        <input type="hidden" name="submissionId" value={s.id} />
        <label className="block">
          <span className="text-sm font-medium">Final score (/ {assignment.max_score})</span>
          <input
            name="finalScore"
            type="number"
            min={0}
            max={assignment.max_score}
            step="0.1"
            defaultValue={existingReview?.final_score ?? grade?.score ?? ""}
            required
            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Comments (Markdown)</span>
          <textarea
            name="comments"
            rows={4}
            defaultValue={existingReview?.comments_md ?? grade?.feedback_md ?? ""}
            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="approvedAi" defaultChecked={!!grade} />
          <span>Approved the system grade with minimal changes</span>
        </label>
        <button type="submit" className="btn-primary w-full">
          Return to student
        </button>
      </form>
    </div>
  );
}
