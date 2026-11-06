"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

// All assessment mutations. RLS enforces teacher-only writes; we also check
// membership up front for a clean error and to resolve the revalidate path.
async function assertTeacher(classroomId: string) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!data) throw new Error("You don't teach this classroom");
  return { supabase, userId: user.id };
}

const listPath = (classroomId: string) => `/teach/classrooms/${classroomId}/assessments`;
const builderPath = (classroomId: string, id: string) => `/teach/classrooms/${classroomId}/assessments/${id}`;

export async function createAssessment(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const title = String(formData.get("title") ?? "").trim();
  const timeLimit = Number(formData.get("timeLimit") ?? 0) || null;
  if (!title) return;
  const { supabase, userId } = await assertTeacher(classroomId);
  const { data, error } = await supabase
    .from("assessments")
    .insert({ classroom_id: classroomId, created_by: userId, title, time_limit_minutes: timeLimit })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create assessment: ${error.message}`);
  redirect(builderPath(classroomId, data.id));
}

// Recompute an assessment's total_points from its questions.
async function recomputeTotal(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  assessmentId: string,
) {
  const { data: qs } = await supabase.from("assessment_questions").select("points").eq("assessment_id", assessmentId);
  const total = (qs ?? []).reduce((s: number, q: any) => s + (Number(q.points) || 0), 0);
  await supabase.from("assessments").update({ total_points: total }).eq("id", assessmentId);
}

const QuestionInput = z.object({
  classroomId: z.string().guid(),
  assessmentId: z.string().guid(),
  kind: z.enum(["mcq", "multi", "short", "written"]),
  prompt: z.string().min(1).max(4000),
  points: z.coerce.number().min(0).max(1000).default(1),
  options: z.array(z.string().min(1).max(500)).max(10).optional(),
  correctIndex: z.coerce.number().int().min(0).optional(),
  correctIndices: z.array(z.coerce.number().int().min(0)).optional(),
  correctText: z.string().max(1000).optional(),
  rubric: z.string().max(4000).optional(),
});

// Add a question AND its server-only answer key in one step.
export async function addQuestion(input: z.input<typeof QuestionInput>) {
  const data = QuestionInput.parse(input);
  const { supabase } = await assertTeacher(data.classroomId);

  // Confirm the assessment is in this classroom (defense in depth).
  const { data: assessment } = await supabase
    .from("assessments").select("id,classroom_id").eq("id", data.assessmentId).maybeSingle();
  if (!assessment || assessment.classroom_id !== data.classroomId) throw new Error("Assessment not found");

  const { count } = await supabase
    .from("assessment_questions").select("id", { count: "exact", head: true }).eq("assessment_id", data.assessmentId);
  const needsOptions = data.kind === "mcq" || data.kind === "multi";
  const { data: q, error } = await supabase
    .from("assessment_questions")
    .insert({
      assessment_id: data.assessmentId,
      position: (count ?? 0) + 1,
      kind: data.kind,
      prompt: data.prompt,
      options: needsOptions ? (data.options ?? []) : null,
      points: data.points,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not add question: ${error.message}`);

  const { error: keyErr } = await supabase.from("assessment_answer_keys").insert({
    question_id: q.id,
    correct_index: data.kind === "mcq" ? (data.correctIndex ?? 0) : null,
    correct_indices: data.kind === "multi" ? (data.correctIndices ?? []) : null,
    correct_text: data.kind === "short" ? (data.correctText ?? "") : null,
    rubric: data.kind === "written" ? (data.rubric ?? "") : null,
  });
  if (keyErr) throw new Error(`Could not save answer key: ${keyErr.message}`);

  await recomputeTotal(supabase, data.assessmentId);
  revalidatePath(builderPath(data.classroomId, data.assessmentId));
  return { ok: true };
}

export async function deleteQuestion(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const assessmentId = String(formData.get("assessmentId"));
  const questionId = String(formData.get("questionId"));
  const { supabase } = await assertTeacher(classroomId);
  const { error } = await supabase.from("assessment_questions").delete().eq("id", questionId).eq("assessment_id", assessmentId);
  if (error) throw new Error(`Could not delete question: ${error.message}`);
  await recomputeTotal(supabase, assessmentId);
  revalidatePath(builderPath(classroomId, assessmentId));
}

export async function setStatus(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const assessmentId = String(formData.get("assessmentId"));
  const status = String(formData.get("status"));
  if (!["draft", "published", "closed"].includes(status)) return;
  const { supabase } = await assertTeacher(classroomId);
  if (status === "published") {
    const { count } = await supabase
      .from("assessment_questions").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId);
    if ((count ?? 0) === 0) throw new Error("Add at least one question before publishing.");
  }
  const { error } = await supabase.from("assessments").update({ status }).eq("id", assessmentId).eq("classroom_id", classroomId);
  if (error) throw new Error(`Could not update the assessment: ${error.message}`);
  revalidatePath(builderPath(classroomId, assessmentId));
}

// ===== Teacher review of written answers + publish =====

const WrittenScore = z.object({
  classroomId: z.string().guid(),
  attemptId: z.string().guid(),
  questionId: z.string().guid(),
  points: z.coerce.number().min(0),
  feedback: z.string().max(4000).optional(),
});
// Score an existing submitted written response; missing rows fail explicitly.
export async function setWrittenScore(input: z.input<typeof WrittenScore>) {
  const data = WrittenScore.parse(input);
  const { supabase } = await assertTeacher(data.classroomId);
  const { error } = await supabase.rpc("score_assessment_written", {
    p_classroom: data.classroomId, p_attempt: data.attemptId, p_question: data.questionId,
    p_points: data.points, p_feedback: data.feedback ?? null,
  });
  if (error) throw new Error(`Could not save the score: ${error.message}`);
  return { ok: true };
}

// AI grading suggestion for a written answer (uses the rubric). Returns a
// suggested score + feedback for the teacher to accept or edit — never auto-saved.
const AiGrade = z.object({
  classroomId: z.string().guid(),
  questionId: z.string().guid(),
  attemptId: z.string().guid(),
});
export async function aiGradeWritten(input: z.input<typeof AiGrade>): Promise<
  { offline: true } | { offline: false; score: number; feedback: string }
> {
  const data = AiGrade.parse(input);
  const { supabase } = await assertTeacher(data.classroomId);
  if (!process.env.ANTHROPIC_API_KEY) return { offline: true };

  const [{ data: q }, { data: key }, { data: resp }] = await Promise.all([
    supabase.from("assessment_questions").select("prompt,points").eq("id", data.questionId).maybeSingle(),
    supabase.from("assessment_answer_keys").select("rubric").eq("question_id", data.questionId).maybeSingle(),
    supabase.from("assessment_responses").select("response").eq("attempt_id", data.attemptId).eq("question_id", data.questionId).maybeSingle(),
  ]);
  const answer = (resp?.response as any)?.text ?? "";
  const max = q?.points ?? 0;

  const { anthropic, MODEL } = await import("@/lib/anthropic");
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system:
      `You grade a student's written exam answer against a rubric. Be fair and concise. ` +
      `Return STRICT JSON only: {"score": <number 0..${max}>, "feedback": "2-3 sentences of specific, constructive feedback"}.`,
    messages: [{
      role: "user",
      content: `Question: ${q?.prompt ?? ""}\nMax points: ${max}\nRubric: ${key?.rubric ?? "(none provided)"}\n\nStudent answer:\n${answer || "(no answer)"}`,
    }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const score = Math.max(0, Math.min(max, Number(parsed.score) || 0));
    return { offline: false, score, feedback: String(parsed.feedback ?? "") };
  } catch {
    return { offline: false, score: 0, feedback: "Could not parse the AI suggestion — grade manually." };
  }
}

// Finalize an attempt: total its response points, mark it graded + published, and
// push the score into the gradebook (same gradebook as everything else).
export async function publishAttempt(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const attemptId = String(formData.get("attemptId"));
  const { supabase } = await assertTeacher(classroomId);

  const { data: assessmentId, error } = await supabase.rpc("publish_assessment_result", {
    p_classroom: classroomId, p_attempt: attemptId,
  });
  if (error || !assessmentId) throw new Error(`Could not publish results: ${error?.message ?? "missing result"}`);
  revalidatePath(`/teach/classrooms/${classroomId}/assessments/${assessmentId}/results`);
  redirect(`/teach/classrooms/${classroomId}/assessments/${assessmentId}/results`);
}

export async function deleteAssessment(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const assessmentId = String(formData.get("assessmentId"));
  const { supabase } = await assertTeacher(classroomId);
  const { error } = await supabase.from("assessments").delete().eq("id", assessmentId).eq("classroom_id", classroomId);
  if (error) throw new Error(`Could not delete the assessment: ${error.message}`);
  redirect(listPath(classroomId));
}
