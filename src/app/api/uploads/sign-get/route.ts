import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({
  submissionId: z.string().guid(),
});

// Mints a short-lived signed URL for a submission attachment.
// Authorization: the requester must be either the submission's student or the
// assignment's teacher. We use the service-role client to issue the signed
// URL after verifying access via the user's session.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: s } = await supabase
    .from("submissions")
    .select("id,file_url,student_id,assignment:assignments(teacher_id)")
    .eq("id", parsed.data.submissionId)
    .single();
  if (!s || !s.file_url) {
    return NextResponse.json({ error: "no file" }, { status: 404 });
  }
  const teacherId = (s as any).assignment?.teacher_id as string | undefined;
  if (user.id !== s.student_id && user.id !== teacherId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await admin.storage
    .from("submissions")
    .createSignedUrl(s.file_url, 60 * 10); // 10 minutes
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "sign failed" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
