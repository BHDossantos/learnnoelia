"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { LANGUAGE_CODES } from "@/lib/languages";

const CourseInput = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  kind: z.enum(["language", "math", "science", "humanities", "arts", "life_skills"]),
  subject: z.string().max(60).optional(),
  language: z.enum(LANGUAGE_CODES as unknown as [string, ...string[]]),
  dialect: z.string().max(20).optional(),
  cefr_level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
});

export async function createCourse(formData: FormData) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const data = CourseInput.parse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    kind: formData.get("kind"),
    subject: formData.get("subject") || undefined,
    language: formData.get("language"),
    dialect: formData.get("dialect") || undefined,
    cefr_level: formData.get("cefr_level") || undefined,
  });

  const { data: course, error } = await supabase
    .from("courses")
    .insert({
      teacher_id: user.id,
      title: data.title,
      description: data.description,
      kind: data.kind,
      subject: data.subject,
      language: data.language,
      dialect: data.dialect,
      cefr_level: data.cefr_level,
      published: true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  redirect(`/teach/courses/${course.id}`);
}

const VocabItemInput = z.object({
  term: z.string().min(1).max(160),
  translation: z.string().min(1).max(200),
  ipa: z.string().max(80).optional(),
  example: z.string().max(400).optional(),
});

const VocabLesson = z.object({
  courseId: z.string().guid(),
  kind: z.literal("vocab"),
  title: z.string().min(2).max(160),
  items: z.array(VocabItemInput).min(1).max(60),
  notes: z.string().max(4000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(180).default(8),
});

const RoleplayLesson = z.object({
  courseId: z.string().guid(),
  kind: z.literal("roleplay"),
  title: z.string().min(2).max(160),
  scenario: z.string().min(5).max(1200),
  persona: z.string().max(400).optional(),
  goal: z.string().max(400).optional(),
  notes: z.string().max(4000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(180).default(10),
});

const ContentLesson = z.object({
  courseId: z.string().guid(),
  kind: z.enum(["reading", "grammar", "listening", "writing"]),
  title: z.string().min(2).max(160),
  content: z.string().min(1).max(12000),
  keyTermsRaw: z.string().max(4000).optional(),
  notes: z.string().max(4000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(180).default(10),
});

const QuizQuestion = z.object({
  prompt: z.string().min(3).max(400),
  options: z.array(z.string().min(1).max(200)).min(2).max(6),
  answer: z.number().int().min(0),
  explanation: z.string().max(400).optional(),
});

const QuizLesson = z.object({
  courseId: z.string().guid(),
  kind: z.literal("quiz"),
  title: z.string().min(2).max(160),
  questions: z.array(QuizQuestion).min(1).max(30),
  notes: z.string().max(4000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(180).default(5),
});

const LessonInput = z.discriminatedUnion("kind", [VocabLesson, RoleplayLesson, ContentLesson, QuizLesson]);

function parseKeyTerms(raw?: string) {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return { term: line, definition: "" };
      return { term: line.slice(0, idx).trim(), definition: line.slice(idx + 1).trim() };
    });
}

export async function createLesson(input: z.input<typeof LessonInput>) {
  const data = LessonInput.parse(input);
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: course } = await supabase
    .from("courses").select("teacher_id").eq("id", data.courseId).single();
  if (!course || course.teacher_id !== user.id) throw new Error("not your course");

  const { data: last } = await supabase
    .from("lessons")
    .select("position")
    .eq("course_id", data.courseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? 0) + 1;

  // Shape `body` per lesson kind. These shapes match what LessonPlayer renders.
  let body: unknown;
  if (data.kind === "vocab") {
    body = { items: data.items };
  } else if (data.kind === "quiz") {
    // Reject out-of-range answer indexes before they reach the player.
    for (const q of data.questions) {
      if (q.answer >= q.options.length) throw new Error("answer index out of range");
    }
    body = { questions: data.questions };
  } else if (data.kind === "roleplay") {
    body = { scenario: data.scenario, persona: data.persona, goal: data.goal };
  } else {
    body = { content: data.content, key_terms: parseKeyTerms(data.keyTermsRaw) };
  }

  const { error } = await supabase.from("lessons").insert({
    course_id: data.courseId,
    position,
    title: data.title,
    kind: data.kind,
    body,
    grammar_notes_md: data.notes || null,
    estimated_minutes: data.estimatedMinutes,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/teach/courses/${data.courseId}`);
  revalidatePath(`/learn/${data.courseId}`);
  redirect(`/teach/courses/${data.courseId}`);
}

const AssignmentInput = z.object({
  courseId: z.string().guid(),
  title: z.string().min(2).max(160),
  instructions: z.string().min(5).max(8000),
  rubricRaw: z.string().max(4000).optional(),
  maxScore: z.coerce.number().int().min(1).max(1000),
  kind: z.enum(["essay", "short_answer", "math", "speaking", "project"]),
  dueAt: z.string().optional(),
});

function parseRubric(raw?: string) {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, weight, ...rest] = line.split("|").map((s) => s.trim());
      return {
        name: name ?? "Criterion",
        weight: Number(weight ?? "0.25"),
        description: rest.join(" | ") || undefined,
      };
    });
}

export async function createAssignment(formData: FormData) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const data = AssignmentInput.parse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    instructions: formData.get("instructions"),
    rubricRaw: formData.get("rubric")?.toString(),
    maxScore: formData.get("maxScore"),
    kind: formData.get("kind"),
    dueAt: formData.get("dueAt")?.toString() || undefined,
  });

  const { data: course } = await supabase
    .from("courses")
    .select("teacher_id,language")
    .eq("id", data.courseId)
    .single();
  if (!course || course.teacher_id !== user.id) throw new Error("not your course");

  const { error } = await supabase.from("assignments").insert({
    course_id: data.courseId,
    teacher_id: user.id,
    title: data.title,
    instructions_md: data.instructions,
    rubric: parseRubric(data.rubricRaw),
    max_score: data.maxScore,
    kind: data.kind,
    language: course.language,
    due_at: data.dueAt ? new Date(data.dueAt).toISOString() : null,
    published: true,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/teach/courses/${data.courseId}`);
  redirect(`/teach/courses/${data.courseId}`);
}

const ReviewInput = z.object({
  submissionId: z.string().guid(),
  finalScore: z.coerce.number().min(0).max(10000),
  comments: z.string().max(8000).optional(),
  approvedAi: z.coerce.boolean(),
});

export async function submitTeacherReview(formData: FormData) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const data = ReviewInput.parse({
    submissionId: formData.get("submissionId"),
    finalScore: formData.get("finalScore"),
    comments: formData.get("comments")?.toString() || undefined,
    approvedAi: formData.get("approvedAi") === "on",
  });

  await supabase.from("teacher_reviews").insert({
    submission_id: data.submissionId,
    teacher_id: user.id,
    final_score: data.finalScore,
    comments_md: data.comments,
    approved_ai: data.approvedAi,
  });
  await supabase.from("submissions").update({ status: "returned" }).eq("id", data.submissionId);

  revalidatePath(`/teach/submissions/${data.submissionId}`);
  redirect(`/teach/submissions/${data.submissionId}`);
}

const LessonUpdate = z.object({
  lessonId: z.string().guid(),
  title: z.string().min(2).max(160),
  bodyJson: z.string().min(2).max(40000),
  notes: z.string().max(4000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(180).default(10),
});

async function assertOwnLesson(supabase: Awaited<ReturnType<typeof supabaseServer>>, lessonId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id,course_id,position,course:courses(teacher_id)")
    .eq("id", lessonId)
    .single();
  if (!lesson || (lesson as any).course?.teacher_id !== user.id) {
    throw new Error("not your lesson");
  }
  return lesson as unknown as { id: string; course_id: string; position: number };
}

export async function updateLesson(formData: FormData) {
  const data = LessonUpdate.parse({
    lessonId: formData.get("lessonId"),
    title: formData.get("title"),
    bodyJson: formData.get("bodyJson"),
    notes: formData.get("notes")?.toString() || undefined,
    estimatedMinutes: formData.get("estimatedMinutes"),
  });
  let body: unknown;
  try {
    body = JSON.parse(data.bodyJson);
  } catch {
    throw new Error("Lesson content is not valid JSON");
  }

  const supabase = await supabaseServer();
  const lesson = await assertOwnLesson(supabase, data.lessonId);

  const { error } = await supabase
    .from("lessons")
    .update({
      title: data.title,
      body,
      grammar_notes_md: data.notes || null,
      estimated_minutes: data.estimatedMinutes,
    })
    .eq("id", data.lessonId);
  if (error) throw new Error(error.message);

  revalidatePath(`/teach/courses/${lesson.course_id}`);
  revalidatePath(`/learn/${lesson.course_id}`);
  redirect(`/teach/courses/${lesson.course_id}`);
}

export async function deleteLesson(formData: FormData) {
  const lessonId = z.string().guid().parse(formData.get("lessonId"));
  const supabase = await supabaseServer();
  const lesson = await assertOwnLesson(supabase, lessonId);

  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
  if (error) throw new Error(error.message);

  revalidatePath(`/teach/courses/${lesson.course_id}`);
  revalidatePath(`/learn/${lesson.course_id}`);
  redirect(`/teach/courses/${lesson.course_id}`);
}

export async function moveLesson(formData: FormData) {
  const lessonId = z.string().guid().parse(formData.get("lessonId"));
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"));
  const supabase = await supabaseServer();
  const lesson = await assertOwnLesson(supabase, lessonId);

  // Swap positions with the neighbor in the chosen direction.
  const { data: neighbor } = await supabase
    .from("lessons")
    .select("id,position")
    .eq("course_id", lesson.course_id)
    .filter("position", direction === "up" ? "lt" : "gt", lesson.position)
    .order("position", { ascending: direction === "down" })
    .limit(1)
    .maybeSingle();
  if (neighbor) {
    await supabase.from("lessons").update({ position: neighbor.position }).eq("id", lesson.id);
    await supabase.from("lessons").update({ position: lesson.position }).eq("id", neighbor.id);
  }

  revalidatePath(`/teach/courses/${lesson.course_id}`);
  revalidatePath(`/learn/${lesson.course_id}`);
  redirect(`/teach/courses/${lesson.course_id}`);
}
