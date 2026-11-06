"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { gradeResponse, tallyAttempt, type ResponseValue } from "@/lib/assessments";

async function requireStudent() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, userId: user.id };
}

// Start (or resume) an attempt for a published assessment the student can see.
export async function startAttempt(formData: FormData) {
  const assessmentId = String(formData.get("assessmentId"));
  const { supabase, userId } = await requireStudent();
  const { data: a } = await supabase.from("assessments").select("id,status").eq("id", assessmentId).maybeSingle();
  if (!a || a.status !== "published") throw new Error("This assessment isn't available.");
  const { error } = await supabase.from("assessment_attempts").upsert(
    { assessment_id: assessmentId, student_id: userId },
    { onConflict: "assessment_id,student_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Could not start the assessment: ${error.message}`);
  redirect(`/assessments/${assessmentId}`);
}

const SaveInput = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  response: z.any(),
});
// Autosave one answer. RLS only allows this while the attempt is in_progress.
export async function saveResponse(input: z.infer<typeof SaveInput>) {
  const data = SaveInput.parse(input);
  const { supabase } = await requireStudent();
  const { error } = await supabase.from("assessment_responses").upsert(
    { attempt_id: data.attemptId, question_id: data.questionId, response: data.response, updated_at: new Date().toISOString() },
    { onConflict: "attempt_id,question_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Submit + grade. The privileged read of answer keys happens server-side via the
// service role, so keys never reach the student. Auto-graded kinds score
// instantly; written questions are left pending for teacher review. A fully
// auto-graded attempt publishes its score straight into the gradebook.
export async function submitAttempt(formData: FormData) {
  const attemptId = String(formData.get("attemptId"));
  const { supabase, userId } = await requireStudent();

  const { data: attempt } = await supabase
    .from("assessment_attempts")
    .select("id,assessment_id,student_id,status")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.student_id !== userId) throw new Error("Attempt not found");
  if (attempt.status !== "in_progress") redirect(`/assessments/${attempt.assessment_id}`);

  const admin = supabaseAdmin();
  if (!admin) throw new Error("Grading is not configured on this deployment (missing service-role key).");

  const { data: assessment } = await admin
    .from("assessments").select("id,title,classroom_id,created_by").eq("id", attempt.assessment_id).single();
  const { data: questions } = await admin
    .from("assessment_questions")
    .select("id,kind,points,position,assessment_answer_keys(correct_index,correct_indices,correct_text,rubric)")
    .eq("assessment_id", attempt.assessment_id)
    .order("position");
  const { data: responses } = await admin
    .from("assessment_responses").select("question_id,response").eq("attempt_id", attemptId);
  const respByQ = new Map((responses ?? []).map((r: any) => [r.question_id, r.response]));

  const graded = new Map<string, { points_awarded: number; is_correct: boolean } | null>();
  const updates: any[] = [];
  for (const q of (questions ?? []) as any[]) {
    const key = Array.isArray(q.assessment_answer_keys) ? q.assessment_answer_keys[0] : q.assessment_answer_keys;
    const resp = respByQ.get(q.id) as ResponseValue | undefined;
    const result = gradeResponse({ kind: q.kind, points: q.points }, key ?? null, resp ?? null);
    graded.set(q.id, result);
    updates.push({
      attempt_id: attemptId,
      question_id: q.id,
      response: resp ?? null,
      points_awarded: result ? result.points_awarded : null,
      is_correct: result ? result.is_correct : null,
    });
  }
  if (updates.length) {
    await admin.from("assessment_responses").upsert(updates, { onConflict: "attempt_id,question_id" });
  }

  const qlite = (questions ?? []).map((q: any) => ({ id: q.id, kind: q.kind, points: q.points }));
  const { score, maxScore, pendingWritten } = tallyAttempt(qlite, graded);
  const fullyGraded = pendingWritten === 0;
  const now = new Date().toISOString();

  await admin.from("assessment_attempts").update({
    status: fullyGraded ? "graded" : "submitted",
    submitted_at: now,
    score,
    max_score: maxScore,
    published: fullyGraded,
  }).eq("id", attemptId);

  // A fully auto-graded result flows straight into the existing gradebook.
  if (fullyGraded && assessment) {
    const { data: gi } = await admin.from("grade_items").upsert(
      { classroom_id: assessment.classroom_id, assessment_id: assessment.id, name: assessment.title, type: "quiz", max_points: maxScore, published: true },
      { onConflict: "classroom_id,assessment_id" },
    ).select("id").single();
    if (gi?.id) {
      await admin.from("grade_entries").upsert(
        { grade_item_id: gi.id, student_id: userId, points: score, graded_by: assessment.created_by, graded_at: now },
        { onConflict: "grade_item_id,student_id" },
      );
    }
  }

  revalidatePath(`/assessments/${attempt.assessment_id}`);
  redirect(`/assessments/${attempt.assessment_id}`);
}
