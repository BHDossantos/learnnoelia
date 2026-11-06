"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { takeRateLimit } from "@/lib/rate-limit";

export async function postDiscussion(formData: FormData) {
  const courseId = z.string().guid().parse(formData.get("courseId"));
  const parentId = formData.get("parentId")?.toString() || null;
  const body = z.string().min(2).max(4000).parse(formData.get("body")?.toString()?.trim());

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  // Spam guard: 10 posts per user per 10 minutes.
  if (!(await takeRateLimit(`disc:${user.id}`, 10, 600))) {
    throw new Error("You're posting fast — take a breather and try again soon.");
  }

  const { error } = await supabase.from("discussions").insert({
    course_id: courseId,
    user_id: user.id,
    parent_id: parentId,
    body,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/learn/${courseId}`);
}

export async function deleteDiscussion(formData: FormData) {
  const id = z.string().guid().parse(formData.get("id"));
  const courseId = z.string().guid().parse(formData.get("courseId"));
  const supabase = await supabaseServer();
  // RLS enforces author-or-teacher; nothing more to check here.
  await supabase.from("discussions").delete().eq("id", id);
  revalidatePath(`/learn/${courseId}`);
}
