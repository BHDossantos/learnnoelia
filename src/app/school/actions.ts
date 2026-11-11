"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { provisionDemoClass } from "@/lib/demo";

async function requireUserId() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, userId: user.id };
}

const CreateOrgInput = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(["school", "district", "tutoring_center", "homeschool"]),
  country: z.string().max(60).optional(),
});

export async function createOrganization(input: z.input<typeof CreateOrgInput>) {
  const data = CreateOrgInput.parse(input);
  const { supabase } = await requireUserId();
  const { data: orgId, error } = await supabase.rpc("create_organization", {
    p_name: data.name,
    p_type: data.type,
    p_country: data.country ?? null,
  });
  if (error) throw new Error(error.message);
  redirect(`/school/${orgId}`);
}

export async function joinOrganization(input: { code: string }) {
  const code = z.string().trim().min(4).max(12).parse(input.code);
  const { supabase } = await requireUserId();
  const { data: orgId, error } = await supabase.rpc("join_organization", { p_code: code });
  if (error) throw new Error(error.message);
  revalidatePath("/school");
  redirect(`/school/${orgId}`);
}

const CreateClassroomInput = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(120),
  gradeLevel: z.string().max(40).optional(),
  term: z.string().max(40).optional(),
});

export async function createClassroom(input: z.input<typeof CreateClassroomInput>) {
  const data = CreateClassroomInput.parse(input);
  const { supabase } = await requireUserId();
  const { error } = await supabase.from("classrooms").insert({
    org_id: data.orgId,
    name: data.name,
    grade_level: data.gradeLevel ?? null,
    term: data.term ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/school/${data.orgId}`);
}

// One-click demo setup for a teacher with no class yet: creates a school, a demo
// classroom pre-loaded with a spread of catalog courses across every subject,
// and makes the teacher its owner + classroom teacher — so they land in a
// working, demonstrable class instead of an empty "go create an org" wall.
// Idempotent: if the teacher already runs a class, it just returns that one.
export async function setupDemoClassroom(): Promise<void> {
  const { supabase, userId } = await requireUserId();

  // Already teaching a class? Go straight there.
  const { data: existing } = await supabase
    .from("classroom_members")
    .select("classroom:classrooms(id,org_id)")
    .eq("user_id", userId)
    .eq("role", "teacher")
    .limit(1)
    .maybeSingle();
  const ex = (existing as any)?.classroom;
  if (ex?.id && ex?.org_id) redirect(`/school/${ex.org_id}/classrooms/${ex.id}`);

  const { orgId, classroomId } = await provisionDemoClass(supabase, supabaseAdmin(), userId);
  revalidatePath("/teach");
  redirect(`/school/${orgId}/classrooms/${classroomId}`);
}

const SetOrgRoleInput = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "teacher", "student"]),
});

export async function setOrgMemberRole(input: z.input<typeof SetOrgRoleInput>) {
  const data = SetOrgRoleInput.parse(input);
  const { supabase } = await requireUserId();
  const { error } = await supabase
    .from("org_members")
    .update({ role: data.role })
    .eq("org_id", data.orgId)
    .eq("user_id", data.userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/school/${data.orgId}`);
}

const ClassroomMemberInput = z.object({
  classroomId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["teacher", "student"]).default("student"),
  orgId: z.string().uuid(),
});

export async function addClassroomMember(input: z.input<typeof ClassroomMemberInput>) {
  const data = ClassroomMemberInput.parse(input);
  const { supabase } = await requireUserId();
  const { error } = await supabase.from("classroom_members").upsert(
    { classroom_id: data.classroomId, user_id: data.userId, role: data.role },
    { onConflict: "classroom_id,user_id" },
  );
  if (error) throw new Error(error.message);
  if (data.role === "student") {
    await supabase.rpc("sync_classroom_member_enrollments", {
      p_classroom: data.classroomId,
      p_user: data.userId,
    });
  }
  revalidatePath(`/school/${data.orgId}/classrooms/${data.classroomId}`);
}

export async function removeClassroomMember(input: z.input<typeof ClassroomMemberInput>) {
  const data = ClassroomMemberInput.parse(input);
  const { supabase } = await requireUserId();
  const { error } = await supabase
    .from("classroom_members")
    .delete()
    .eq("classroom_id", data.classroomId)
    .eq("user_id", data.userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/school/${data.orgId}/classrooms/${data.classroomId}`);
}

const ClassroomCourseInput = z.object({
  orgId: z.string().uuid(),
  classroomId: z.string().uuid(),
  courseId: z.string().uuid(),
});

export async function assignCourseToClassroom(input: z.input<typeof ClassroomCourseInput>) {
  const data = ClassroomCourseInput.parse(input);
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase.from("classroom_courses").upsert(
    { classroom_id: data.classroomId, course_id: data.courseId, assigned_by: userId },
    { onConflict: "classroom_id,course_id" },
  );
  if (error) throw new Error(error.message);
  // Auto-enroll every current student in the classroom.
  await supabase.rpc("sync_classroom_course_enrollments", {
    p_classroom: data.classroomId,
    p_course: data.courseId,
  });
  revalidatePath(`/school/${data.orgId}/classrooms/${data.classroomId}`);
}

const ClassroomCoursesInput = z.object({
  orgId: z.string().uuid(),
  classroomId: z.string().uuid(),
  courseIds: z.array(z.string().uuid()).min(1).max(100),
});

// Assign several catalog (or own) courses to a classroom at once, auto-enrolling
// every current student in each. Lets a teacher tick boxes in the catalog and
// stand up a class in one step instead of building courses from scratch.
export async function assignCoursesToClassroom(input: z.input<typeof ClassroomCoursesInput>) {
  const data = ClassroomCoursesInput.parse(input);
  const { supabase, userId } = await requireUserId();
  const rows = data.courseIds.map((course_id) => ({
    classroom_id: data.classroomId,
    course_id,
    assigned_by: userId,
  }));
  const { error } = await supabase
    .from("classroom_courses")
    .upsert(rows, { onConflict: "classroom_id,course_id" });
  if (error) throw new Error(error.message);
  for (const course_id of data.courseIds) {
    await supabase.rpc("sync_classroom_course_enrollments", {
      p_classroom: data.classroomId,
      p_course: course_id,
    });
  }
  revalidatePath(`/school/${data.orgId}/classrooms/${data.classroomId}`);
}

export async function unassignCourseFromClassroom(input: z.input<typeof ClassroomCourseInput>) {
  const data = ClassroomCourseInput.parse(input);
  const { supabase } = await requireUserId();
  const { error } = await supabase
    .from("classroom_courses")
    .delete()
    .eq("classroom_id", data.classroomId)
    .eq("course_id", data.courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/school/${data.orgId}/classrooms/${data.classroomId}`);
}
