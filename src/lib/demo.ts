import type { SupabaseClient } from "@supabase/supabase-js";

// A single shared "John Doe" demo student, seeded with real enrollments and
// lesson progress, so every role can be demonstrated end-to-end out of the box:
// a parent follows John to see grades/progress; a teacher's demo class has John
// on the roster to grade and track. Server-only (needs the service-role admin
// client, which bypasses RLS).

export const DEMO_STUDENT_EMAIL = "demo.john.doe@students.learnnoelia.com";
export const DEMO_STUDENT_NAME = "John Doe";

// Create the demo student if needed and seed a realistic learning history.
// Returns the student's profile id. Idempotent.
export async function ensureDemoStudent(admin: SupabaseClient): Promise<string> {
  // Already created? Find by the marker email we store on the profile.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", DEMO_STUDENT_EMAIL)
    .maybeSingle();
  if (existing?.id) {
    await seedDemoProgress(admin, existing.id);
    return existing.id;
  }

  // Create the auth user (the signup trigger creates the profile row).
  const { data: created, error } = await admin.auth.admin.createUser({
    email: DEMO_STUDENT_EMAIL,
    email_confirm: true,
    password: crypto.randomUUID() + crypto.randomUUID(),
    user_metadata: { display_name: DEMO_STUDENT_NAME },
  });
  if (error || !created?.user) {
    // Possibly already registered but the profile marker wasn't set — try once
    // more to find it by display name among auto-created students.
    const { data: fallback } = await admin
      .from("profiles")
      .select("id")
      .eq("display_name", DEMO_STUDENT_NAME)
      .eq("auto_created", true)
      .limit(1)
      .maybeSingle();
    if (fallback?.id) {
      await admin.from("profiles").update({ email: DEMO_STUDENT_EMAIL }).eq("id", fallback.id);
      await seedDemoProgress(admin, fallback.id);
      return fallback.id;
    }
    throw new Error(`Could not create the demo student: ${error?.message ?? "unknown error"}`);
  }
  const id = created.user.id;
  await admin
    .from("profiles")
    .update({ display_name: DEMO_STUDENT_NAME, role: "student", auto_created: true, email: DEMO_STUDENT_EMAIL })
    .eq("id", id);

  await seedDemoProgress(admin, id);
  return id;
}

// Enroll the demo student in a few flagship catalog courses and mark their first
// lessons complete with believable scores, so the parent/teacher views show a
// real journey. Idempotent (upserts).
async function seedDemoProgress(admin: SupabaseClient, studentId: string): Promise<void> {
  // Already has progress? Skip the (idempotent but chatty) re-seed.
  const { count } = await admin
    .from("lesson_progress")
    .select("lesson_id", { count: "exact", head: true })
    .eq("user_id", studentId);
  if ((count ?? 0) > 0) return;

  // One flagship course from each of a few subjects.
  const { data: courses } = await admin
    .from("courses")
    .select("id,school,position")
    .eq("published", true)
    .is("teacher_id", null)
    .order("school")
    .order("position");
  const bySchool = new Map<string, string>();
  for (const c of (courses ?? []) as any[]) {
    if (!bySchool.has(c.school)) bySchool.set(c.school, c.id as string);
  }
  const demoCourseIds = [...bySchool.values()].slice(0, 4);
  if (demoCourseIds.length === 0) return;

  await admin.from("enrollments").upsert(
    demoCourseIds.map((course_id) => ({ user_id: studentId, course_id, role: "student" })),
    { onConflict: "user_id,course_id" },
  );

  // Complete the first few lessons of each course with scores in the 70s-90s.
  const { data: lessons } = await admin
    .from("lessons")
    .select("id,course_id,position")
    .in("course_id", demoCourseIds)
    .order("position");
  const takenPerCourse = new Map<string, number>();
  const rows: { user_id: string; lesson_id: string; score: number; completed_at: string }[] = [];
  const now = Date.now();
  for (const l of (lessons ?? []) as any[]) {
    const n = takenPerCourse.get(l.course_id) ?? 0;
    if (n >= 5) continue; // first 5 lessons per course
    takenPerCourse.set(l.course_id, n + 1);
    rows.push({
      user_id: studentId,
      lesson_id: l.id,
      score: 72 + Math.floor(Math.random() * 24), // 72-95
      // spread completions over the last ~2 weeks for a believable curve
      completed_at: new Date(now - (rows.length + 1) * 36 * 3600 * 1000).toISOString(),
    });
  }
  if (rows.length) {
    await admin.from("lesson_progress").upsert(rows, { onConflict: "user_id,lesson_id" });
  }
}
