"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { removeAccountUploads } from "@/lib/account-deletion";
import { getStripe } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase/server";

const ProfileInput = z.object({
  displayName: z.string().min(1).max(80),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  dailyGoalXp: z.coerce.number().int().min(10).max(1000),
  role: z.enum(["student", "teacher", "parent"]).optional(),
});

export async function updateProfile(formData: FormData) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const data = ProfileInput.parse({
    displayName: formData.get("displayName"),
    cefr: formData.get("cefr"),
    dailyGoalXp: formData.get("dailyGoalXp"),
    role: formData.get("role") ?? undefined,
  });

  const profileUpdate: Record<string, unknown> = {
    display_name: data.displayName,
    cefr_level: data.cefr,
  };
  if (data.role) profileUpdate.role = data.role;

  await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", user.id);

  await supabase
    .from("user_stats")
    .upsert(
      { user_id: user.id, daily_goal_xp: data.dailyGoalXp },
      { onConflict: "user_id" },
    );

  revalidatePath("/settings");
  revalidatePath("/profile");
  redirect("/settings?saved=1");
}

// Permanently delete the account: removes the auth user (profiles row and
// dependent personal rows cascade). Storage must be removed first.
// Failed deletion leaves the account available so the owner can retry.
export async function deleteAccount() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Account deletion is not configured on this deployment");
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } },
  );
  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions").select("stripe_subscription_id").eq("user_id", user.id).maybeSingle();
  if (subscriptionError) throw new Error("Could not check your subscription. Please retry account deletion.");
  if (subscription?.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.cancel(subscription.stripe_subscription_id);
    } catch (error) {
      // Retrying deletion after a successful cancellation is safe.
      if ((error as { code?: string }).code !== "resource_missing")
        throw new Error("Could not cancel your subscription. Your account has not been deleted; please retry.");
    }
  }
  await removeAccountUploads(admin, user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error("Could not delete your account. Please retry or contact support.");

  await supabase.auth.signOut();
  // Return normally: the client must not catch Next's redirect exception as an error.
  return { deleted: true };

}
