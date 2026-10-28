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

// Provision a ready-to-demo class for `userId`: a school, a "Demo Class" loaded
// with a spread of catalog courses, the John Doe demo student on the roster, and
// one teacher-authored example course. Returns the org + classroom ids. Does not
// redirect — callers decide where to go. `supabase` is the caller's own client
// (teacher-owned writes); `admin` (nullable) seeds the shared demo student.
export async function provisionDemoClass(
  supabase: SupabaseClient,
  admin: SupabaseClient | null,
  userId: string,
): Promise<{ orgId: string; classroomId: string }> {
  const { data: profile } = await supabase
    .from("profiles").select("display_name").eq("id", userId).maybeSingle();
  const owner = (profile?.display_name as string | null)?.trim();
  const orgName = owner ? `${owner}'s School` : "My School";

  const { data: orgId, error: orgErr } = await supabase.rpc("create_organization", {
    p_name: orgName, p_type: "school", p_country: null,
  });
  if (orgErr) throw new Error(orgErr.message);

  const { data: classroom, error: clsErr } = await supabase
    .from("classrooms")
    .insert({ org_id: orgId, name: "Demo Class", term: "Fall 2026" })
    .select("id")
    .single();
  if (clsErr) throw new Error(clsErr.message);
  await supabase
    .from("classroom_members")
    .upsert({ classroom_id: classroom.id, user_id: userId, role: "teacher" }, { onConflict: "classroom_id,user_id" });

  // Up to 4 catalog courses per subject.
  const { data: cat } = await supabase
    .from("courses").select("id,school,position")
    .eq("published", true).is("teacher_id", null).order("school").order("position");
  const perSchool = new Map<string, number>();
  const pick: string[] = [];
  for (const c of (cat ?? []) as any[]) {
    const n = perSchool.get(c.school) ?? 0;
    if (n < 4) { pick.push(c.id as string); perSchool.set(c.school, n + 1); }
  }
  if (pick.length) {
    await supabase.from("classroom_courses").upsert(
      pick.map((course_id) => ({ classroom_id: classroom.id, course_id, assigned_by: userId })),
      { onConflict: "classroom_id,course_id" },
    );
  }

  // John Doe on the roster + enrolled, so the teacher has a real student.
  if (admin) {
    try {
      const demoId = await ensureDemoStudent(admin);
      await admin
        .from("classroom_members")
        .upsert({ classroom_id: classroom.id, user_id: demoId, role: "student" }, { onConflict: "classroom_id,user_id" });
      if (pick.length) {
        await admin.from("enrollments").upsert(
          pick.map((course_id) => ({ user_id: demoId, course_id, role: "student" })),
          { onConflict: "user_id,course_id" },
        );
      }
    } catch { /* demo student is a nicety */ }
  }

  // One teacher-authored example course so "Your courses" isn't empty.
  try {
    const { data: ownCourse } = await supabase
      .from("courses")
      .insert({
        teacher_id: userId,
        title: "My First Course (example) — Study Skills 101",
        description: "An example course you own. Edit it, add lessons, or delete it anytime.",
        kind: "humanities", school: "humanities", subject: "Study Skills", language: "en", published: true,
      })
      .select("id")
      .single();
    if (ownCourse?.id) {
      await supabase.from("lessons").insert([
        {
          course_id: ownCourse.id, position: 1, title: "How to study effectively", kind: "reading",
          body: { sections: [
            { heading: "Spaced practice", text: "Short study sessions spread over days beat one long cram. Revisit material just as you are about to forget it and it sticks far longer." },
            { heading: "Active recall", text: "Close the book and try to retrieve the answer from memory. The struggle to recall is what builds durable learning." },
          ] },
          estimated_minutes: 8,
        },
        {
          course_id: ownCourse.id, position: 2, title: "Quick check", kind: "quiz",
          body: { questions: [
            { prompt: "Which is more effective for long-term memory?", options: ["One long cram session", "Short sessions spread over days"], answer: 1, explanation: "Spaced practice beats massed practice for retention." },
          ] },
          estimated_minutes: 3,
        },
      ]);
    }
  } catch { /* example course is optional */ }

  return { orgId: orgId as string, classroomId: classroom.id as string };
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
