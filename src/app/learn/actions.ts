"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const Input = z.object({ courseId: z.string().guid() });

export async function enrollInCourse(input: z.input<typeof Input>) {
  const { courseId } = Input.parse(input);
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await supabase
    .from("enrollments")
    .upsert(
      { user_id: user.id, course_id: courseId, role: "student" },
      { onConflict: "user_id,course_id", ignoreDuplicates: true },
    );

  revalidatePath(`/learn/${courseId}`);
  revalidatePath("/assignments");
}

export async function unenrollFromCourse(input: z.input<typeof Input>) {
  const { courseId } = Input.parse(input);
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await supabase
    .from("enrollments")
    .delete()
    .eq("user_id", user.id)
    .eq("course_id", courseId);

  revalidatePath(`/learn/${courseId}`);
  revalidatePath("/assignments");
}
