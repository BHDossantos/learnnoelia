"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { gradeResponse } from "@/lib/assessments";
import { AssessmentAnswers, AssessmentResponse } from "@/lib/assessment-input";

async function requireStudent() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, userId: user.id };
}

export async function startAttempt(formData: FormData) {
  const assessmentId = z.string().guid().parse(formData.get("assessmentId"));
  const { supabase } = await requireStudent();
  const { error } = await supabase.rpc("start_assessment_attempt", { p_assessment: assessmentId });
  if (error) throw new Error(`Could not start the assessment: ${error.message}`);
  redirect(`/assessments/${assessmentId}`);
}

// Best-effort monitoring event (tab focus loss, start, submit). RLS ensures the
// student can only log events for their own attempt.
export async function logMonitorEvent(attemptId: string, eventType: string) {
  if (!["start", "focus_lost", "focus_gained", "submit"].includes(eventType)) return;
  try {
    const { supabase } = await requireStudent();
    await supabase.from("assessment_monitor_events").insert({ attempt_id: attemptId, event_type: eventType });
  } catch { /* monitoring must never break the exam */ }
}


const SaveInput = z.object({ attemptId: z.string().guid(), questionId: z.string().guid(), response: AssessmentResponse });

export async function saveResponse(input: z.infer<typeof SaveInput>) {
  const data = SaveInput.parse(input);
  const { supabase } = await requireStudent();
  const { error } = await supabase.rpc("save_assessment_response", {
    p_attempt: data.attemptId, p_question: data.questionId, p_response: data.response,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function submitAttempt(formData: FormData) {
  const attemptId = z.string().guid().parse(formData.get("attemptId"));
  // Full browser snapshot includes answers still awaiting debounced autosave.
  // Never substitute an empty snapshot when decoding fails.
  const answers = AssessmentAnswers.parse(JSON.parse(String(formData.get("responses"))));
  const { supabase, userId } = await requireStudent();
  const { data: attempt, error: attemptError } = await supabase.from("assessment_attempts")
    .select("id,assessment_id,student_id,status").eq("id", attemptId).maybeSingle();
  if (attemptError) throw new Error("Could not load the attempt. Please retry.");
  if (!attempt || attempt.student_id !== userId) throw new Error("Attempt not found");
  if (attempt.status !== "in_progress") redirect(`/assessments/${attempt.assessment_id}`);
  const admin = supabaseAdmin();
  if (!admin) throw new Error("Grading is not configured on this deployment.");
  const { data: questions, error: questionError } = await admin.from("assessment_questions")
    .select("id,kind,points,assessment_answer_keys(correct_index,correct_indices,correct_text,correct_number,number_tolerance,rubric)")
    .eq("assessment_id", attempt.assessment_id).order("position");
  if (questionError || !questions?.length) throw new Error("Could not load assessment questions. Please retry.");
  const ids = new Set(questions.map(q => q.id));
  if (Object.keys(answers).some(id => !ids.has(id))) throw new Error("Answer belongs to another assessment");
  const results = questions.map((q: any) => {
    const key = Array.isArray(q.assessment_answer_keys) ? q.assessment_answer_keys[0] : q.assessment_answer_keys;
    if (!key) throw new Error("An answer key is missing. Ask your teacher to review this assessment.");
    const response = answers[q.id] ?? null;
    const grade = gradeResponse(q, key, response);
    return { question_id: q.id, response, points_awarded: grade?.points_awarded ?? null, is_correct: grade?.is_correct ?? null };
  });
  const { error } = await admin.rpc("submit_assessment_result", { p_attempt: attemptId, p_actor: userId, p_results: results });
  if (error) throw new Error(`Could not submit the assessment: ${error.message}`);
  revalidatePath(`/assessments/${attempt.assessment_id}`);
  redirect(`/assessments/${attempt.assessment_id}`);
}
