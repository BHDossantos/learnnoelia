"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureDemoStudent, provisionDemoClass } from "@/lib/demo";

// One click sets up the WHOLE app to demo from a single account: a teacher demo
// class (with John Doe + catalog courses), a student enrollment for this account,
// and a parent link to John Doe. One account can then walk student → teacher →
// parent end to end. Idempotent.
export async function setupFullDemo(): Promise<void> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const admin = supabaseAdmin();

  // 1) Teacher: a demo class (skip if they already run one).
  const { data: existing } = await supabase
    .from("classroom_members")
    .select("classroom:classrooms(id)")
    .eq("user_id", user.id)
    .eq("role", "teacher")
    .limit(1)
    .maybeSingle();
  if (!(existing as any)?.classroom?.id) {
    try { await provisionDemoClass(supabase, admin, user.id); } catch { /* best effort */ }
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
