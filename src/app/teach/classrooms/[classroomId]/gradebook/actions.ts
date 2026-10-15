"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

// All gradebook mutations. RLS already restricts writes to the classroom's
// teacher, but we check membership up front for a clean error and to resolve the
// path to revalidate.
async function assertTeacher(classroomId: string) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data } = await supabase.rpc("is_classroom_teacher", { p_classroom: classroomId });
  if (!data) throw new Error("You don't teach this classroom");
  return supabase;
}

function gbPath(classroomId: string) {
  return `/teach/classrooms/${classroomId}/gradebook`;
}

export async function ensureGradebookSettings(classroomId: string) {
  const supabase = await assertTeacher(classroomId);
  await supabase.from("gradebook_settings").upsert({ classroom_id: classroomId }, { onConflict: "classroom_id" });
}

const SettingsInput = z.object({
  classroomId: z.string().uuid(),
  mode: z.enum(["points", "weighted"]).optional(),
  showClassAverage: z.boolean().optional(),
});
export async function updateGradebookSettings(input: z.infer<typeof SettingsInput>) {
  const { classroomId, mode, showClassAverage } = SettingsInput.parse(input);
  const supabase = await assertTeacher(classroomId);
  const patch: Record<string, unknown> = { classroom_id: classroomId, updated_at: new Date().toISOString() };
  if (mode) patch.mode = mode;
  if (typeof showClassAverage === "boolean") patch.show_class_average = showClassAverage;
  await supabase.from("gradebook_settings").upsert(patch, { onConflict: "classroom_id" });
  revalidatePath(gbPath(classroomId));
}

export async function addCategory(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const name = String(formData.get("name") ?? "").trim();
  const weight = Number(formData.get("weight") ?? 0) || 0;
  if (!name) return;
  const supabase = await assertTeacher(classroomId);
  const { count } = await supabase
    .from("grade_categories")
    .select("id", { count: "exact", head: true })
    .eq("classroom_id", classroomId);
  await supabase.from("grade_categories").insert({ classroom_id: classroomId, name, weight, position: (count ?? 0) + 1 });
  revalidatePath(gbPath(classroomId));
}

export async function deleteCategory(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const id = String(formData.get("id"));
  const supabase = await assertTeacher(classroomId);
  await supabase.from("grade_categories").delete().eq("id", id).eq("classroom_id", classroomId);
  revalidatePath(gbPath(classroomId));
}

export async function addItem(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const name = String(formData.get("name") ?? "").trim();
  const maxPoints = Number(formData.get("maxPoints") ?? 100) || 100;
  const weight = Number(formData.get("weight") ?? 0) || 0;
  const type = String(formData.get("type") ?? "manual");
  const categoryId = String(formData.get("categoryId") ?? "");
  const dueAt = String(formData.get("dueAt") ?? "");
  if (!name) return;
  const supabase = await assertTeacher(classroomId);
  const { count } = await supabase
    .from("grade_items")
    .select("id", { count: "exact", head: true })
    .eq("classroom_id", classroomId);
  await supabase.from("grade_items").insert({
    classroom_id: classroomId,
    name,
    max_points: maxPoints,
    weight,
    type: ["assignment", "quiz", "paper", "participation", "project", "manual"].includes(type) ? type : "manual",
    category_id: categoryId || null,
    due_at: dueAt ? new Date(dueAt).toISOString() : null,
    position: (count ?? 0) + 1,
  });
  revalidatePath(gbPath(classroomId));
}

export async function deleteItem(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const id = String(formData.get("id"));
  const supabase = await assertTeacher(classroomId);
  await supabase.from("grade_items").delete().eq("id", id).eq("classroom_id", classroomId);
  revalidatePath(gbPath(classroomId));
}

export async function toggleItemPublished(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const id = String(formData.get("id"));
  const published = String(formData.get("published")) === "true";
  const supabase = await assertTeacher(classroomId);
  await supabase.from("grade_items").update({ published }).eq("id", id).eq("classroom_id", classroomId);
  revalidatePath(gbPath(classroomId));
}

// ===== Assignment <-> gradebook sync =====

// Pull each roster student's final score for an assignment into grade_entries.
// Authoritative score is the teacher's reviewed score; falls back to the AI
// grade. Students without a submission (or score) are left untouched.
async function syncEntriesFor(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  classroomId: string,
  gradeItemId: string,
  assignmentId: string,
  graderId: string,
): Promise<number> {
  // Roster = students in this classroom.
  const { data: roster } = await supabase
    .from("classroom_members")
    .select("user_id")
    .eq("classroom_id", classroomId)
    .eq("role", "student");
  const studentIds = new Set((roster ?? []).map((r: any) => r.user_id as string));
  if (studentIds.size === 0) return 0;

  const { data: subs } = await supabase
    .from("submissions")
    .select("id,student_id")
    .eq("assignment_id", assignmentId);
  const relevant = (subs ?? []).filter((s: any) => studentIds.has(s.student_id));
  if (relevant.length === 0) return 0;

  const subIds = relevant.map((s: any) => s.id);
  const [{ data: reviews }, { data: aiGrades }] = await Promise.all([
    supabase.from("teacher_reviews").select("submission_id,final_score,reviewed_at").in("submission_id", subIds),
    supabase.from("ai_grades").select("submission_id,score,created_at").in("submission_id", subIds),
  ]);

  // Latest review / AI grade per submission.
  const latestReview = new Map<string, number>();
  for (const r of (reviews ?? []) as any[]) {
    if (r.final_score == null) continue;
    const prev = latestReview.get(r.submission_id);
    if (prev === undefined) latestReview.set(r.submission_id, r.final_score);
  }
  const latestAi = new Map<string, number>();
  for (const g of (aiGrades ?? []) as any[]) {
    if (g.score == null) continue;
    if (!latestAi.has(g.submission_id)) latestAi.set(g.submission_id, g.score);
  }

  const rows: any[] = [];
  for (const s of relevant as any[]) {
    const score = latestReview.get(s.id) ?? latestAi.get(s.id);
    if (score == null) continue;
    rows.push({
      grade_item_id: gradeItemId,
      student_id: s.student_id,
      points: score,
      graded_by: graderId,
      graded_at: new Date().toISOString(),
    });
  }
  if (rows.length === 0) return 0;
  await supabase.from("grade_entries").upsert(rows, { onConflict: "grade_item_id,student_id" });
  return rows.length;
}

// Create a gradebook column from one of the teacher's assignments (or reuse the
// existing linked column) and pull in any grades that already exist.
export async function importAssignment(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!assignmentId) return;
  const supabase = await assertTeacher(classroomId);
  const { data: { user } } = await supabase.auth.getUser();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id,title,max_score,teacher_id,due_at")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment || assignment.teacher_id !== user!.id) throw new Error("Assignment not found");

  // Reuse an existing linked item, or create one.
  let { data: item } = await supabase
    .from("grade_items")
    .select("id")
    .eq("classroom_id", classroomId)
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (!item) {
    const { count } = await supabase
      .from("grade_items")
      .select("id", { count: "exact", head: true })
      .eq("classroom_id", classroomId);
    const { data: created } = await supabase
      .from("grade_items")
      .insert({
        classroom_id: classroomId,
        assignment_id: assignmentId,
        name: assignment.title,
        type: "assignment",
        max_points: assignment.max_score ?? 100,
        due_at: assignment.due_at ?? null,
        position: (count ?? 0) + 1,
      })
      .select("id")
      .single();
    item = created;
  }
  if (item) await syncEntriesFor(supabase, classroomId, item.id, assignmentId, user!.id);
  revalidatePath(gbPath(classroomId));
}

// Re-pull the latest scores for an already-linked assignment column.
export async function syncAssignmentItem(formData: FormData) {
  const classroomId = String(formData.get("classroomId"));
  const gradeItemId = String(formData.get("id"));
  const supabase = await assertTeacher(classroomId);
  const { data: { user } } = await supabase.auth.getUser();
  const { data: item } = await supabase
    .from("grade_items")
    .select("id,assignment_id")
    .eq("id", gradeItemId)
    .eq("classroom_id", classroomId)
    .maybeSingle();
  if (item?.assignment_id) {
    await syncEntriesFor(supabase, classroomId, item.id, item.assignment_id, user!.id);
    revalidatePath(gbPath(classroomId));
  }
}

// Upsert a single grade. points="" clears the grade (back to ungraded).
const EntryInput = z.object({
  classroomId: z.string().uuid(),
  gradeItemId: z.string().uuid(),
  studentId: z.string().uuid(),
  points: z.number().nullable(),
  feedback: z.string().max(4000).optional(),
});
export async function setEntry(input: z.infer<typeof EntryInput>) {
  const { classroomId, gradeItemId, studentId, points, feedback } = EntryInput.parse(input);
  const supabase = await assertTeacher(classroomId);
  const { data: { user } } = await supabase.auth.getUser();
  if (points == null && !feedback) {
    // clearing the grade entirely
    await supabase.from("grade_entries").delete().eq("grade_item_id", gradeItemId).eq("student_id", studentId);
  } else {
    await supabase.from("grade_entries").upsert(
      {
        grade_item_id: gradeItemId,
        student_id: studentId,
        points,
        feedback_md: feedback ?? null,
        graded_by: user!.id,
        graded_at: new Date().toISOString(),
      },
      { onConflict: "grade_item_id,student_id" },
    );
  }
  revalidatePath(gbPath(classroomId));
  return { ok: true };
}
