import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MarkTarget, SaveMarkings } from "@/lib/markings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(req: Request) {
  const parsed = MarkTarget.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return reply({ error: "Invalid target" }, 400);
  const { kind, id } = parsed.data;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply({ error: "unauthorized" }, 401);
  const { data: source, error } = await db.rpc("marking_source", { p_kind: kind, p_id: id });
  if (error) return reply({ error: "Could not load original work" }, error.code === "P0002" ? 404 : 500);
  const { data: documents, error: readError } = await db.from("grading_markings").select("id,source_key,source_text,source_file,source_mime,marks,version,updated_at")
    .eq(kind === "paper" ? "paper_id" : "submission_id", id).order("updated_at", { ascending: false });
  if (readError) return reply({ error: "Could not load saved markings" }, 500);
  // Paper originals use session RLS. Submission attachments follow the existing
  // sign-get route: first establish participant access, then sign with admin.
  let signer = db;
  let studentId: string | undefined;
  if (kind === "submission") {
    const { data: submission } = await db.from("submissions").select("student_id,assignment:assignments(teacher_id)").eq("id", id).single();
    const assignment = submission?.assignment as unknown as { teacher_id: string } | null;
    if (!submission || (user.id !== submission.student_id && user.id !== assignment?.teacher_id)) return reply({ error: "forbidden" }, 403);
    studentId = submission.student_id;
    const admin = supabaseAdmin();
    if (!admin && (source.file || documents?.some(d => d.source_file))) return reply({ error: "Attachment storage is unavailable" }, 503);
    if (admin) signer = admin;
  }
  const urls: Record<string, string> = {};
  const files = new Set<string>([source.file, ...(documents ?? []).map(d => d.source_file)].filter(Boolean));
  for (const file of files) {
    if (studentId && !file.startsWith(`${studentId}/`)) return reply({ error: "Invalid attachment owner" }, 403);
    const { data, error: signError } = await signer.storage.from(kind === "paper" ? "paper-originals" : "submissions").createSignedUrl(file, 600);
    if (signError || !data) return reply({ error: "Could not load original attachment. Your saved markings are unchanged." }, 502);
    urls[file] = data.signedUrl;
  }
  return reply({ source, documents: documents ?? [], urls });
}

export async function PUT(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON" }, 400); }
  const parsed = SaveMarkings.safeParse(body);
  if (!parsed.success) return reply({ error: "Invalid markings" }, 400);
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply({ error: "unauthorized" }, 401);
  const { kind, id, sourceKey, version, marks } = parsed.data;
  const { data, error } = await db.rpc("save_grading_markings", { p_kind: kind, p_id: id, p_source_key: sourceKey, p_version: version, p_marks: marks });
  if (error) {
    if ((error.code === "PT409" || error.code === "40001")) return reply({ error: "The work or its markings changed. Your edits are still here. Reload to review the saved version before trying again." }, 409);
    return reply({ error: error.code === "42501" ? "Only this student's teacher can save markings." : "Could not save markings. Your edits are still here." }, error.code === "42501" ? 403 : 500);
  }
  return reply({ document: data });
}
