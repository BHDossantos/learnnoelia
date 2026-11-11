"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

async function requireUserId() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, userId: user.id };
}

const PostInput = z.object({
  orgId: z.string().guid(),
  classroomId: z.string().guid(),
  body: z.string().min(1).max(4000),
  pinned: z.boolean().default(false),
});

export async function postAnnouncement(input: z.input<typeof PostInput>) {
  const data = PostInput.parse(input);
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase.from("announcements").insert({
    classroom_id: data.classroomId,
    body: data.body,
    pinned: data.pinned,
    posted_by: userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/school/${data.orgId}/classrooms/${data.classroomId}`);
}

const DeleteInput = z.object({
  orgId: z.string().guid(),
  classroomId: z.string().guid(),
  announcementId: z.string().guid(),
});

export async function deleteAnnouncement(input: z.input<typeof DeleteInput>) {
  const data = DeleteInput.parse(input);
  const { supabase } = await requireUserId();
  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", data.announcementId);
  if (error) throw new Error(error.message);
  revalidatePath(`/school/${data.orgId}/classrooms/${data.classroomId}`);
}
