import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { preservePaperOriginal } from "@/lib/paper-original";
import { buildPaperGradingSystem } from "@/lib/grading";
import { classifyFile, pptxToText } from "@/lib/extract";
import { findOrCreateStudent } from "@/lib/students";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 16 * 1024 * 1024; // 16MB per file

// Grade ONE uploaded paper (image / PDF / PowerPoint). The client calls this once
// per file for a bulk upload, so each request stays small and progress is live.
// Detects the student's name (unless a studentId override is given), finds or
// creates their account in the chosen classroom, grades, and files the result
// (which notifies the student, their parents, and their teachers via the trigger).
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  const classroomId = String(form.get("classroomId") ?? "");
  const subject = (form.get("subject") ? String(form.get("subject")) : "") || null;
  const title = (form.get("title") ? String(form.get("title")) : "") || null;
  const answerKey = (form.get("answerKey") ? String(form.get("answerKey")) : "") || null;
  const maxScoreRaw = Number(form.get("maxScore") ?? 100);
  const maxScore = Number.isFinite(maxScoreRaw) && maxScoreRaw > 0 ? Math.min(1000, Math.round(maxScoreRaw)) : 100;
  const studentIdOverride = form.get("studentId") ? String(form.get("studentId")) : "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!classroomId) {
    return NextResponse.json({ error: "Pick a classroom first." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 16MB)." }, { status: 413 });
  }

  // The teacher must actually teach the chosen classroom.
  const { data: teaches } = await supabase
    .from("classroom_members")
    .select("classroom_id")
    .eq("classroom_id", classroomId)
    .eq("user_id", user.id)
    .eq("role", "teacher")
    .maybeSingle();
  if (!teaches) {
    return NextResponse.json({ error: "You don't teach that classroom." }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ offline: true }, { status: 503 });
  }
  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Account auto-creation is not configured (missing service-role key)." },
      { status: 503 },
    );
  }

  const { takeRateLimit } = await import("@/lib/rate-limit");
  if (!(await takeRateLimit(`gradefile:${user.id}`, 200, 3600))) {
    return NextResponse.json({ error: "Too many gradings right now — try again shortly." }, { status: 429 });
  }

  // Build the model input from the file.
  const kind = classifyFile(file.type, file.name);
  const buf = Buffer.from(await file.arrayBuffer());
  const content: any[] = [];
  let originalText: string | null = null;
  let sourceKind: "image" | "pdf" | "pptx" | "typed" = "typed";

  if (kind === "image") {
    sourceKind = "image";
    const media = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
      ? file.type
      : "image/jpeg";
    content.push({ type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } });
    content.push({ type: "text", text: "Grade the attached paper." });
  } else if (kind === "pdf") {
    sourceKind = "pdf";
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
    });
    content.push({ type: "text", text: "Grade the attached paper (PDF)." });
  } else if (kind === "pptx") {
    sourceKind = "pptx";
    let text = "";
    try { text = await pptxToText(buf); } catch { text = ""; }
    if (!text.trim()) {
      return NextResponse.json({ error: "Could not read any text from that PowerPoint file." }, { status: 422 });
    }
    originalText = text;
    content.push({ type: "text", text: `Grade this presentation. Slide text follows:\n\n${text.slice(0, 40000)}` });
  } else {
    // Plain text / unknown: try to read as UTF-8.
    const text = buf.toString("utf-8");
    if (!text.trim()) {
      return NextResponse.json({ error: "Unsupported file type. Use an image, PDF, or PowerPoint." }, { status: 415 });
    }
    originalText = text;
    sourceKind = "typed";
    content.push({ type: "text", text: `Grade this submission:\n\n${text.slice(0, 40000)}` });
  }

  const system = buildPaperGradingSystem({
    subject,
    maxScore,
    answerKey,
    fromImage: kind === "image",
    detectName: !studentIdOverride,
    withAnnotations: true,
  });

  const { anthropic, MODEL } = await import("@/lib/anthropic");
  let raw = "";
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content }],
    });
    raw = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  } catch (err: any) {
    return NextResponse.json({ error: `Grading failed: ${err?.message ?? "model error"}` }, { status: 502 });
  }

  const jsonText = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let g: any;
  try { g = JSON.parse(jsonText); }
  catch { return NextResponse.json({ error: "Could not parse the grade.", raw: raw.slice(0, 500) }, { status: 502 }); }

  // Resolve the student.
  let student: { id: string; displayName: string; created: boolean; email: string | null; parentEmail: string | null };
  if (studentIdOverride) {
    const { data: allowed } = await supabase.rpc("teaches_student", { student: studentIdOverride });
    if (!allowed) return NextResponse.json({ error: "You don't teach that student." }, { status: 403 });
    const { data: p } = await admin
      .from("profiles")
      .select("id, display_name, email, parent_email")
      .eq("id", studentIdOverride)
      .single();
    student = {
      id: studentIdOverride,
      displayName: p?.display_name ?? "Student",
      created: false,
      email: p?.email ?? null,
      parentEmail: p?.parent_email ?? null,
    };
  } else {
    const first = typeof g.first_name === "string" ? g.first_name.trim() : "";
    const last = typeof g.last_name === "string" ? g.last_name.trim() : "";
    if (!first && !last) {
      // No name found and no override — hand the grade back so the teacher can
      // assign it manually, without filing it yet.
      return NextResponse.json({ needsStudent: true, grade: g, sourceKind, fileName: file.name });
    }
    try {
      student = await findOrCreateStudent(admin, { classroomId, firstName: first, lastName: last });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? "Could not resolve the student." }, { status: 500 });
    }
  }

  const originalMime = kind === "image" ? content[0].source.media_type as string
    : kind === "pdf" ? "application/pdf"
    : kind === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "text/plain";
  let originalPath: string;
  try { originalPath = await preservePaperOriginal(supabase, user.id, buf, originalMime); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 502 }); }

  // File the grading (the trigger notifies student + parents + teachers).
  const { data: saved, error } = await supabase
    .from("paper_gradings")
    .insert({
      student_id: student.id,
      graded_by: user.id,
      title: title ?? subject ?? file.name ?? "Paper",
      subject,
      source: sourceKind,
      raw_text: originalText ?? (typeof g.transcribed === "string" ? g.transcribed : null),
      original_path: originalPath,
      original_mime: originalMime,
      score: typeof g.score === "number" ? g.score : null,
      max_score: typeof g.max_score === "number" ? g.max_score : maxScore,
      feedback_md: [g.summary_md, g.feedback_md].filter(Boolean).join("\n\n") || null,
      focus_areas: Array.isArray(g.focus_areas) ? g.focus_areas.slice(0, 8) : null,
      plan_md: typeof g.plan_md === "string" ? g.plan_md : null,
      annotations: Array.isArray(g.annotations) ? g.annotations.slice(0, 100) : null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: saved.id,
    student,
    grade: {
      score: g.score ?? null,
      max_score: g.max_score ?? maxScore,
      summary_md: g.summary_md ?? null,
      focus_areas: Array.isArray(g.focus_areas) ? g.focus_areas : [],
    },
  });
}
