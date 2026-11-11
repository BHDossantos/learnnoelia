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

  // One teacher-authored example course so "Your courses" isn't empty — created
  // BEFORE the graded-workflow seed so that seed can attach an assignment to it.
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

  // John Doe on the roster + enrolled, plus the full graded workflow (gradebook,
  // a graded paper, a reviewed assignment) so the teacher journey has a real story.
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
      await seedDemoTeacherWorkflow(admin, classroom.id, userId, demoId);
    } catch { /* demo student is a nicety */ }
  }

  return { orgId: orgId as string, classroomId: classroom.id as string };
}

// Seed a COMPLETE graded workflow for the demo class so every teacher surface
// tells a story: a gradebook with the demo student's grades, a graded paper, and
// a couple of submitted + reviewed assignments. Idempotent (skips if the
// gradebook already has items). Runs with the admin client (bypasses RLS).
export async function seedDemoTeacherWorkflow(
  admin: SupabaseClient,
  classroomId: string,
  teacherId: string,
  studentId: string,
): Promise<void> {
  const { count: existingItems } = await admin
    .from("grade_items")
    .select("id", { count: "exact", head: true })
    .eq("classroom_id", classroomId);
  if ((existingItems ?? 0) > 0) return; // already seeded

  const now = new Date().toISOString();
  await admin.from("gradebook_settings").upsert({ classroom_id: classroomId, mode: "points" }, { onConflict: "classroom_id" });

  // Gradebook columns + the demo student's grades.
  const itemSpecs = [
    { name: "Diagnostic quiz", type: "quiz", max_points: 100, position: 1, points: 72 },
    { name: "Homework 1", type: "manual", max_points: 20, position: 2, points: 18 },
    { name: "Unit 1 Test", type: "paper", max_points: 100, position: 3, points: 84 },
    { name: "Participation", type: "participation", max_points: 10, position: 4, points: 9 },
  ];
  const { data: items } = await admin
    .from("grade_items")
    .insert(itemSpecs.map((s) => ({
      classroom_id: classroomId, name: s.name, type: s.type, max_points: s.max_points, position: s.position, published: true,
    })))
    .select("id,name");
  if (items && items.length) {
    const pointsByName = new Map(itemSpecs.map((s) => [s.name, s.points]));
    await admin.from("grade_entries").upsert(
      items.map((it: any) => ({
        grade_item_id: it.id, student_id: studentId, points: pointsByName.get(it.name) ?? 0,
        graded_by: teacherId, graded_at: now,
      })),
      { onConflict: "grade_item_id,student_id" },
    );
  }

  // A graded paper (scan) with feedback, focus areas, a plan, and marked-up items.
  try {
    await admin.from("paper_gradings").insert({
      student_id: studentId,
      graded_by: teacherId,
      title: "Unit 1 Test — Algebra",
      subject: "Algebra I",
      source: "image",
      raw_text: "Student handwritten solutions to 10 linear-equation problems.",
      score: 84,
      max_score: 100,
      feedback_md: "Strong work on one-step and two-step equations. Watch sign errors when moving terms across the equals sign, and show the check step on word problems.",
      focus_areas: ["Distributing a negative sign", "Isolating the variable in two steps", "Checking solutions in word problems"],
      plan_md: "1) 10 min: two-step equations drill. 2) Re-do problems 3 and 7, showing each step. 3) One word problem with a written check.",
      status: "graded",
      annotations: [
        { label: "Q3", correct: false, detail: "Sign flipped when subtracting 5 from both sides.", correct_answer: "x = 4" },
        { label: "Q7", correct: false, detail: "Forgot to distribute the -2.", correct_answer: "x = -3" },
        { label: "Q1, Q2, Q4-Q6, Q8-Q10", correct: true, detail: "Clean, correct work." },
      ],
    });
  } catch { /* optional */ }

  // A teacher-OWNED graded assignment loop (on the teacher's own example course,
  // so it shows in "Needs your review" and the assignment page): ensure an
  // assignment exists, enroll John, and record a submitted + graded + reviewed
  // response. Also feeds the parent's "graded work" view.
  try {
    const { data: ownCourse } = await admin
      .from("courses").select("id").eq("teacher_id", teacherId)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (ownCourse?.id) {
      await admin.from("enrollments").upsert(
        { user_id: studentId, course_id: ownCourse.id, role: "student" },
        { onConflict: "user_id,course_id" },
      );
      let { data: asg } = await admin
        .from("assignments").select("id,max_score").eq("course_id", ownCourse.id).limit(1).maybeSingle();
      if (!asg) {
        const { data: created } = await admin.from("assignments").insert({
          course_id: ownCourse.id, teacher_id: teacherId,
          title: "Reflection: your study plan",
          instructions_md: "Write a short paragraph about how you will use spaced practice and active recall this week.",
          rubric: [], max_score: 100, kind: "essay", language: "en", published: true,
        }).select("id,max_score").single();
        asg = created;
      }
      if (asg?.id) {
        const { data: sub } = await admin.from("submissions").upsert(
          { assignment_id: asg.id, student_id: studentId, text: "I'll study 20 minutes a day using active recall and review older topics every few days so they stick.", status: "graded", submitted_at: now },
          { onConflict: "assignment_id,student_id" },
        ).select("id").single();
        if (sub?.id) {
          const max = asg.max_score ?? 100;
          await admin.from("ai_grades").insert({
            submission_id: sub.id, score: Math.round(max * 0.88), max_score: max,
            feedback_md: "Clear plan with a concrete daily habit. Add one measurable goal to make progress easy to check.", confidence: 0.9,
          });
          await admin.from("teacher_reviews").insert({
            submission_id: sub.id, teacher_id: teacherId, final_score: Math.round(max * 0.9),
            comments_md: "Great reflection — specific and realistic. Approved.", approved_ai: true,
          });
        }
      }
    }
  } catch { /* optional */ }
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
