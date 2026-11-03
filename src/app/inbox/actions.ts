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

export async function markNotificationRead(input: { id: string }) {
  const id = z.string().guid().parse(input.id);
  const { supabase, userId } = await requireUserId();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function markAllNotificationsRead() {
  const { supabase, userId } = await requireUserId();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  revalidatePath("/inbox");
  revalidatePath("/");
}
