"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureDemoStudent, provisionDemoClass, seedDemoTeacherWorkflow } from "@/lib/demo";

// One click sets up the WHOLE app to demo from a single account: a teacher demo
// class (with John Doe + catalog courses), a student enrollment for this account,
// and a parent link to John Doe. One account can then walk student → teacher →
// parent end to end. Idempotent.
export async function setupFullDemo(): Promise<void> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const admin = supabaseAdmin();

  // 1) Teacher: a demo class (reuse an existing one, else provision a new one).
  const { data: existing } = await supabase
    .from("classroom_members")
    .select("classroom:classrooms(id)")
    .eq("user_id", user.id)
    .eq("role", "teacher")
    .limit(1)
    .maybeSingle();
  let classroomId: string | undefined = (existing as any)?.classroom?.id;
  if (!classroomId) {
    try { classroomId = (await provisionDemoClass(supabase, admin, user.id)).classroomId; } catch { /* best effort */ }
  }

  // Seed the full graded workflow (gradebook, graded paper, reviewed work) into
  // the class — including an EXISTING demo class that predates this, so the
  // teacher journey always has a real story. Idempotent.
  if (admin && classroomId) {
    try {
      const demoId = await ensureDemoStudent(admin);
      await admin
        .from("classroom_members")
        .upsert({ classroom_id: classroomId, user_id: demoId, role: "student" }, { onConflict: "classroom_id,user_id" });
      await seedDemoTeacherWorkflow(admin, classroomId, user.id, demoId);
    } catch { /* best effort */ }
  }

  // 2) Student: enroll this account in one flagship course so "My Learning" is live.
  try {
    const { data: course } = await supabase
      .from("courses")
      .select("id")
      .eq("published", true)
      .is("teacher_id", null)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (course?.id) {
      await supabase.from("enrollments").upsert(
        { user_id: user.id, course_id: course.id, role: "student" },
        { onConflict: "user_id,course_id", ignoreDuplicates: true },
      );
    }
  } catch { /* best effort */ }

  // 3) Parent: follow John Doe (via admin so RLS on guardians doesn't block it).
  if (admin) {
    try {
      const demoId = await ensureDemoStudent(admin);
      await admin.from("guardians").upsert(
        { guardian_id: user.id, student_id: demoId },
        { onConflict: "guardian_id,student_id", ignoreDuplicates: true },
      );
    } catch { /* best effort */ }
  }

  revalidatePath("/demo");
  redirect("/demo");
}
