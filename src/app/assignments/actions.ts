"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

const SubmitInput = z.object({
  assignmentId: z.string().guid(),
  text: z.string().max(20000).default(""),
  filePath: z.string().max(500).nullish(),
});

export async function submitAssignment(input: z.input<typeof SubmitInput>) {
  const data = SubmitInput.parse(input);
  if (!data.text.trim() && !data.filePath) {
    throw new Error("Provide text, an attachment, or a recording");
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: submission, error } = await supabase
    .from("submissions")
    .upsert(
      {
        assignment_id: data.assignmentId,
        student_id: user.id,
        text: data.text,
        file_url: data.filePath ?? null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,student_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Kick off AI grading in the background if there's text to grade.
  if (data.text.trim().length > 0) {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("host");
    if (host) {
      fetch(`${proto}://${host}/api/grade`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: h.get("cookie") ?? "",
        },
        body: JSON.stringify({ submissionId: submission.id }),
      }).catch(() => {});
    }
  }

  await supabase.rpc("award_xp", { p_amount: 15, p_kind: "submission" });

  revalidatePath(`/assignments/${data.assignmentId}`);
  redirect(`/assignments/${data.assignmentId}/result`);
}
