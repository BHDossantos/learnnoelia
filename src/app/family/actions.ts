"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureDemoStudent } from "@/lib/demo";

function makeCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function ensureInviteCode() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles").select("guardian_invite_code").eq("id", user.id).single();
  if (profile?.guardian_invite_code) return profile.guardian_invite_code;

  // Retry a few times in case of a unique collision.
  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    const { error } = await supabase
      .from("profiles").update({ guardian_invite_code: code }).eq("id", user.id);
    if (!error) {
      revalidatePath("/family");
      return code;
    }
  }
  throw new Error("Could not generate invite code");
}

export async function linkStudent(input: { code: string }) {
  const code = z.string().trim().toUpperCase().length(6).parse(input.code);
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Preferred path: a code-validated SECURITY DEFINER function. Direct inserts
  // into `guardians` are locked down (anyone could otherwise link themselves to
  // any student), so linking must prove knowledge of the student's invite code.
  const { error: rpcError } = await supabase.rpc("link_guardian_by_code", { p_code: code });
  if (!rpcError) {
    revalidatePath("/family");
    return;
  }
  // Only fall back to the legacy direct path if the security migration (0045)
  // isn't applied yet; otherwise surface the real error (bad/own code, etc.).
  if (!/does not exist/i.test(rpcError.message)) {
    throw new Error(
      /No student found/i.test(rpcError.message) ? "No student found for that code" :
      /own code/i.test(rpcError.message) ? "That's your own code" :
      rpcError.message,
    );
  }
  const { data: student } = await supabase
    .from("profiles").select("id").eq("guardian_invite_code", code).maybeSingle();
  if (!student) throw new Error("No student found for that code");
  if (student.id === user.id) throw new Error("That's your own code");
  const { error } = await supabase
    .from("guardians")
    .upsert(
      { guardian_id: user.id, student_id: student.id },
      { onConflict: "guardian_id,student_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
  revalidatePath("/family");
}

// One-click demo: link the parent to the shared "John Doe" demo student (seeded
// with real enrollments and grades) so they can walk the whole parent journey.
export async function followDemoStudent(): Promise<void> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const admin = supabaseAdmin();
  if (!admin) throw new Error("Demo student isn't available on this deployment yet.");
  const demoId = await ensureDemoStudent(admin);

  // Link via the admin client so RLS on guardians doesn't block the demo link.
  await admin
    .from("guardians")
    .upsert({ guardian_id: user.id, student_id: demoId }, { onConflict: "guardian_id,student_id", ignoreDuplicates: true });

  revalidatePath("/family");
  redirect(`/parent/${demoId}`);
}

export async function unlinkStudent(input: { studentId: string }) {
  const studentId = z.string().uuid().parse(input.studentId);
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await supabase
    .from("guardians")
    .delete()
    .eq("guardian_id", user.id)
    .eq("student_id", studentId);
  revalidatePath("/family");
}
